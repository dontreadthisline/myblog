+++
title = "Hare 系统调用机制：从 harec 到 qbe 到 cc 完整链路分析"
date = 2026-05-30
draft = false
+++

# Hare 系统调用机制：从 harec 到 qbe 到 cc 完整链路分析

## 核心设计哲学

*Hare 没有为系统调用添加任何编译器特殊支持。** 系统调用只是普通的函数调用。harec 不知道也不关心被调函数是 Hare 函数还是汇编实现的 syscall wrapper。这个设计极其简洁。

## 关键组件

| 组件 | 文件 | 角色 |
|------|------|------|
| syscall 声明 | `hare/sys/+linux/syscalls.ha:17-23` | 无函数体的函数声明 |
| syscall 汇编实现 | `hare/sys/+linux/syscall+x86_64.s` | 手写汇编，执行 `syscall` 指令 |
| syscall 号常量 | `hare/sys/+linux/syscallno+x86_64.ha` | `SYS_read=0`, `SYS_write=1`, `SYS_openat=257` |
| syscall 分发器 | `hare/sys/+linux/syscalls.ha:4-15` | `syscall()` 函数，根据参数个数转发到 `syscall0`~`syscall6` |
| 错误处理 | `hare/sys/+linux/errno.ha:9-14` | `wrap_return()` 检查返回值是否在 `[-4095, -1]` 范围 |
| 高级封装 (open) | `hare/sys/+linux/syscalls.ha:67-71` | `sys::open()` 调用 `syscall4(SYS_openat, ...)` |
| os 层 | `hare/os/+linux/dirfdfs.ha:148-164` | `_fs_open()` → `sys::openat2()` |
| io 层 | `hare/io/handle.ha:27` | `io::write()` 多态分发到具体实现 |

---

## 场景 1：普通 Hare 函数 `add`

```hare
fn add(a: i64, b: i64) i64 = a + b;
let result = add(3, 4);
```

**调用链：** `main` → `add` (直接调用，一层函数调用)

### harec → QBE IR

```
export function w $add(w %a, w %b) {
    %result = add %a, %b
    ret %result
}

// 调用点：
%result =w call $add(w %a, w %b)
```

关键代码在 `harec/src/gen.c:1485-1488`，所有函数调用统一生成 `Q_CALL` 指令：

```c
struct qbe_statement call = {
    .type = Q_INSTR,
    .instr = Q_CALL,
};
```

### qbe → Assembly

```
add:
    addl %esi, %edi    # x86_64: RDI=a, RSI=b
    movl %edi, %eax
    ret

# 调用点:
callq add
```

### cc → 链接

直接将 `callq add` 解析到同文件内的 `add` 标签地址。无外部符号依赖。

---

## 场景 2：`fmt::println`

```hare
fmt::println("hello")!;
```

### 完整调用链（逐层追踪）

```
fmt::println("hello")                              # wrappers.ha:82
  └─ fmt::fprintln(os::stdout, "hello")            # wrappers.ha:83
       └─ fmt::fprint(os::stdout, "hello")         # print.ha:13
            ├─ 格式化字符串 (纯 Hare 代码)
            └─ io::write(os::stdout, buf)          # handle.ha:27
                 └─ handle.write(handle, buf)       # 多态分发 → file 类型
                      └─ io::writev(fd, buf)       # io/+linux/vector.ha:44
                           └─ sys::writev(fd, &iov, 1)
                                └─ sys::syscall3(SYS_writev=20, fd, iov, cnt)
                                     └─ [汇编] sys.syscall3
```

### syscall3 汇编实现（`syscall+x86_64.s:27-33`）

```asm
sys.syscall3:
    movq %rdi, %rax    # %rdi=syscall号(20) → %rax (内核用rax读syscall号)
    movq %rsi, %rdi    # %rsi=fd → %rdi (内核第1参数)
    movq %rdx, %rsi    # %rdx=iov → %rsi (内核第2参数)
    movq %rcx, %rdx    # %rcx=cnt → %rdx (内核第3参数)
    syscall             # ← 进入内核！
    ret                 # 内核返回后，结果在 %rax
```

### 参数寄存器映射：C ABI → 内核 ABI

| 参数位置 | C调用约定 (输入) | 内核调用约定 (syscall后) |
|----------|-----------------|------------------------|
| syscall号 | `%rdi` | `%rax` |
| 第1参数 | `%rsi` | `%rdi` |
| 第2参数 | `%rdx` | `%rsi` |
| 第3参数 | `%rcx` | `%rdx` |
| 第4参数 | `%r8` | `%r10` |
| 第5参数 | `%r9` | `%r8` |
| 第6参数 | 栈 `8(%rsp)` | `%r9` |

x86_64 System V ABI 和 Linux 内核调用约定参数寄存器不同，内核用 `R10` 替代 `RCX` 作为第4参数——因为 `syscall` 指令会 clobber `RCX`（保存返回地址）和 `R11`（保存 RFLAGS）。

### 错误处理（`wrap_return`, `errno.ha:9-14`）

```hare
fn wrap_return(r: u64) (errno | u64) = {
    if (r > -4096: u64) {             // 内核返回错误码：值在 [-4095, -1]
        return (-(r: i64)): errno;    // 转为正的 errno 码
    };
    return r;                          // 正常返回值，直接透传
};
```

Linux 内核从不返回 0 到 -4095 之间的值作为正常返回值，而是用这个范围表示负的 errno。Hare 利用这个约定，用简单的范围检查来区分错误和正常返回。

---

## 场景 3：`os::open`

```hare
let fd = os::open("/tmp/test.txt")!;
```

### 完整调用链（逐层追踪）

```
os::open("/tmp/test.txt")                          # os/os.ha:116
  └─ fs::open_file(cwd, "/tmp/test.txt", RDONLY)   # fs/fs.ha:41
       └─ cwd.openfile(cwd, path, flags)            # 多态分发
            └─ fs_open_file(cwd, path, flags)       # os/+linux/dirfdfs.ha:166
                 ├─ 构造 open_how 结构体 (flags + mode)
                 └─ _fs_open(fs, path, &oh)         # dirfdfs.ha:148
                      └─ sys::openat2(fs.dirfd, path, &oh, size)
                           └─ wrap_return(syscall4(SYS_openat2=437, ...))
                                └─ [汇编] sys.syscall4
```

### syscall4 汇编实现（`syscall+x86_64.s:36-44`）

```asm
sys.syscall4:
    movq %rdi, %rax    # syscall号 → rax
    movq %r8, %r10     # %r8 → %r10 (内核用r10替代rcx)
    movq %rsi, %rdi    # 重排参数
    movq %rdx, %rsi
    movq %rcx, %rdx
    syscall
    ret
```

注意 `%r8 → %r10` 这个额外的 mov：因为 `syscall` 指令会 clobber `%rcx`，内核约定用 `%r10` 传递第4参数。

### 完整 syscall0~syscall6 实现（`syscall+x86_64.s`）

```asm
sys.syscall0:
    movq %rdi, %rax           # 只有 syscall 号
    syscall
    ret

sys.syscall1:
    movq %rdi, %rax
    movq %rsi, %rdi
    syscall
    ret

sys.syscall2:
    movq %rdi, %rax
    movq %rsi, %rdi
    movq %rdx, %rsi
    syscall
    ret

sys.syscall3:
    movq %rdi, %rax
    movq %rsi, %rdi
    movq %rdx, %rsi
    movq %rcx, %rdx
    syscall
    ret

sys.syscall4:
    movq %rdi, %rax
    movq %r8, %r10           # 额外处理 r8→r10
    movq %rsi, %rdi
    movq %rdx, %rsi
    movq %rcx, %rdx
    syscall
    ret

sys.syscall5:
    movq %rdi, %rax
    movq %r8, %r10
    movq %rsi, %rdi
    movq %r9, %r8            # 额外处理 r9→r8
    movq %rdx, %rsi
    movq %rcx, %rdx
    syscall
    ret

sys.syscall6:
    movq %rdi, %rax
    movq %r8, %r10
    movq %rsi, %rdi
    movq %r9, %r8
    movq %rdx, %rsi
    movq 8(%rsp), %r9        # 第6参数从栈上读取
    movq %rcx, %rdx
    syscall
    ret
```

---

## QBE 和 cc 的角色

### qbe：QBE IR → Assembly

qbe 将 QBE IR 的 `call` 指令统一转为 AT&T 语法的 `callq`：

```c
// qbe/amd64/emit.c:585-604
case Ocall:
    switch (rtype(i.arg[0])) {
    case RCon:
        fprintf(e->f, "\tcallq ");
        emitcon(con, e);
        if (con->type == CAddr && (con->sym.type & SExt) && !T.apple)
            fprintf(e->f, "@plt");   // 外部符号加 @plt (PLT 跳转)
        break;
    case RTmp:
        emitf("callq *%L0", &i, e);  // 函数指针间接调用
        break;
    }
```

**关键点：** qbe 不区分 Hare 函数还是汇编函数——统一生成 `callq`，依赖符号类型（`SExt` 标志）决定是否加 `@plt`（Procedure Linkage Table，用于动态链接的外部符号）。

### cc：汇编 → Machine Code → 链接

```
# 步骤:
1. gcc -c hare_output.s → hare_output.o     (汇编 qbe 生成的 .s)
2. gcc -c syscall+x86_64.s → syscall.o      (汇编手写汇编 .s)
3. gcc -c restore+x86_64.s → restore.o      (rt.restore 信号处理)
4. ld *.o -o executable                      (链接，解析所有符号)
```

链接器将：

- `callq sys.syscall4@plt` 解析到 `syscall+x86_64.s` 中定义的 `sys.syscall4` 标签
- `callq add` 解析到 qbe 生成的 `add` 标签
- 两者处理方式完全相同

---

## 特殊 syscall：`rt.restore` 信号返回

```asm
# hare/rt/+linux/restore+x86_64.s
rt.restore:
rt.restore_si:
    movl $15, %eax       # SYS_rt_sigreturn = 15
    syscall
```

`rt.restore` 是信号处理返回的 trampoline——内核在信号处理完后通过这个函数执行 `rt_sigreturn` syscall 来恢复被信号打断的上下文。与普通 syscall 不同的是它没有 `ret` 指令，因为 `rt_sigreturn` 会直接恢复寄存器并返回到被中断的位置。

---

## 三种场景的 QBE IR 对比

```
╔══════════════════════════════════════════════════════════════╗
║ 场景1: add(3, 4)                                            ║
║   %r =w call $add(w 3, w 4)                                 ║
║   → callq add                                                ║
║   → 同文件内直接跳转，纯用户态                               ║
╠══════════════════════════════════════════════════════════════╣
║ 场景2: fmt::println("hello")                                 ║
║   %r =l call $fmt.fprintln(...)                              ║
║   → 多层 call → %r =l call $sys.syscall3(l 1, l fd, ...)   ║
║   → callq sys.syscall3@plt                                   ║
║   → 手写汇编 mov + syscall 指令 → 内核态                     ║
╠══════════════════════════════════════════════════════════════╣
║ 场景3: os::open("/tmp/test.txt")                             ║
║   %r =l call $os.open(...)                                   ║
║   → 多层 call → %r =l call $sys.syscall4(l 257, ...)        ║
║   → callq sys.syscall4@plt                                   ║
║   → 手写汇编 mov + syscall 指令 → 内核态                     ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 核心结论

**从 harec 的角度看，所有三种函数调用的代码生成完全一样——都是 `Q_CALL` 指令。** 区别仅在于链接时符号解析的目标：

1. **普通 Hare 函数**：符号指向 qbe 生成的本地汇编代码
2. **syscall wrapper**：符号指向手写汇编中的 `sys.syscallN` 标签，该标签包含 `syscall` 指令
3. **中间层**（`fmt::println` → `io::write` → `sys::write` → ...）：每一层都是普通 Hare 函数调用，在 IR 层面和场景1无区别

Hare 不需要编译器内建 syscall 支持（如 Rust 的 `asm!` 宏或 Go 的 runtime syscall），它完全依赖 **C ABI 兼容的函数调用机制 + 手写汇编 wrapper** 来完成用户态到内核态的过渡。这是极简且优雅的设计——编译器保持纯粹，复杂性集中在7个手写汇编函数和一个 `wrap_return` 错误检查中。
