+++
title = "Hare 语言实现架构：系统的系统"
date = 2026-05-30
draft = false
+++

# Hare 语言实现架构：系统的系统

## 总览

Hare 是一个简洁的系统编程语言，其官方实现由**三个独立可替换的组件**构成。理解 Hare 实现的关键是理解这些组件各自的职责边界，以及它们之间传递的数据格式。

```
┌──────────────────────────────────────────────────────────┐
│                     Hare 语言实现                         │
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │  harec   │───▶│   qbe    │───▶│  cc (gcc/clang)  │   │
│  │  .ha→.ssa│    │ .ssa→.s  │    │   .s→ELF (链接)   │   │
│  │  (C11)   │    │  (C)     │    │   + as + ld       │   │
│  └──────────┘    └──────────┘    └──────────────────┘   │
│       ▲                                           │      │
│       │          ┌──────────────────┐              │      │
│       └──────────│  hare (构建驱动)  │──────────────┘      │
│                  │  标准库 (.ha)     │                     │
│                  │  (Hare 语言编写)  │                     │
│                  └──────────────────┘                     │
└──────────────────────────────────────────────────────────┘
```

**核心原则：每个阶段只通过文本文件（源码、IR、汇编）通信，没有共享内存、没有中间进程通信。** 这种设计使得任何一个阶段都可以被替换——比如用 cranelift 替换 qbe，不需要修改 harec 和 hare。

---

## 一、设计哲学：反编译器特殊化

Hare 实现最核心的设计决策可以概括为：**编译器没有为任何语言特性添加特殊处理，所有"特权操作"都是普通的函数调用。**

### 1.1 系统调用不是编译器特性

```hare
// sys/+linux/syscalls.ha — 只是函数声明，没有函数体
fn syscall0(u64) u64;
fn syscall1(u64, u64) u64;
fn syscall2(u64, u64, u64) u64;
fn syscall3(u64, u64, u64, u64) u64;
// ...
```

```asm
# sys/+linux/syscall+x86_64.s — 手写汇编实现
.global syscall0
syscall0:
    movq %rdi, %rax    # C ABI: %rdi 是函数参数 → syscall 号放入 %rax
    syscall
    ret
```

对 harec 而言，`syscall3(SYS_write, 1, msg, len)` 和 `add(1, 2)` 生成**完全相同的 `Q_CALL` 指令**。区分只发生在链接时：前者解析到汇编 .o，后者解析到其他 Hare 函数编译的 .o。

### 1.2 @symbol 属性不是 FFI 机制

```hare
// rt/+linux/start+x86_64-linux.s 使用 C 符号
.global _start
_start:
    ...

// rt/start.ha 通过 @symbol 桥接
export fn @symbol("_start") _start() void;
```

`@symbol` 只做一件事：**覆写链接时导出的符号名**。它不改变代码生成、不改变调用约定、不改变内存布局。它只是把 Hare 命名空间（`rt::start`）映射到 C 命名空间（`_start`）的一座桥。

### 1.3 没有内置类型——类型系统是库代码

Hare 没有 `int`、`long`、`float` 这样的内置类型。基础类型是 `i8`、`i16`、`i32`、`i64`、`u8`... 它们的实现方式和其他 struct/union 一样——由编译器前端的类型检查器统一处理，不需要后端特殊支持。

---

## 二、引导过程：先有 C 还是先有 Hare

```
  阶段 1: gcc 编译 harec（C 源码 → harec 二进制）
         harec 是 C11 写的，可以用任何 C 编译器编译
  
  阶段 2: harec 编译 hare + stdlib（Hare 源码 → hare 二进制）
         现在有了 Hare 编译器，编译 Hare 写的构建工具和标准库
  
  阶段 3: hare 成为用户面向的命令
         ./hare build myprogram.ha
```

**harec 是引导编译器，终极目标是让自己变多余。** 一旦有自举的 Hare 编译器，ha rec 就可以退出历史舞台。这个模式模仿了早期 C 编译器（先用汇编写 C 编译器，再用 C 编译器编译自己）。

---

## 三、harec：.ha → .ssa 的四道工序

harec 是整个工具链的核心——它把一个 Hare 源文件翻译成 QBE IR 文本。四道工序之间通过内存对象传递数据：

```
  .ha 文件（UTF-8 文本）
      │
      ▼
  ┌──────────┐
  │  Lexer   │  src/lex.c        字符流 → Token 流
  │          │  char → token       两字符前瞻、unlex 回溯
  └────┬─────┘
       │  token stream
       ▼
  ┌──────────┐
  │  Parser  │  src/parse.c      Token 流 → 无类型 AST
  │          │  递归下降 + Pratt 运算符优先级（11级）
  └────┬─────┘
       │  untyped AST (struct ast_expression, ast_decl, ...)
       ▼
  ┌──────────┐
  │  Check   │  src/check.c + eval.c + type_store.c
  │          │  无类型 AST → 类型化/已验证的 declaration 树
  │          │  • 名称解析（scope.c）—— 嵌套词法作用域
  │          │  • 类型推断 —— 隐式转换插入
  │          │  • 编译时求值（eval.c）—— 常量表达式
  │          │  • 类型归约 —— 控制流汇合点类型计算
  │          │  • 声明求解器 —— 多趟扫描，支持前向引用
  └────┬─────┘
       │  checked & typed declarations
       ▼
  ┌──────────┐
  │   Gen    │  src/gen.c + genutil.c + qbe.c
  │          │  类型化声明 → QBE IR 文本
  │          │  每个 Hare 表达式 → QBE 指令序列
  └────┬─────┘
       │
       ▼
  .ssa 文件（QBE IR 文本）
```

### 3.1 Lexer（词法分析）

职责单一：把 UTF-8 字节流切成 token 序列。每个 token 携带源码位置信息（文件、行、列）用于错误报告。

关键设计：
- **两字符前瞻**：大多数语言用一个字符前瞻就能区分 token 类型，Hare lexer 用两个字符消除歧义（如 `>>` vs `>`）
- **unlex**：parser 回溯时可以推回一个 token，不需要 seek
- **Token 平等**：`fn`、`+`、`@symbol`、`syscall3` 在 lexer 眼里都是同一枚举的成员，没有任何语义区分

### 3.2 Parser（语法分析）

递归下降解析器，对每个文法规则写一个解析函数。遇到表达式时切换到 Pratt parser——每个运算符有优先级（1-11）和结合性，驱动解析过程。

输出的是**无类型 AST**——结构正确但没有任何类型信息，所有标识符都是裸字符串。例如 `a + b` 被解析为 `AST_BINARITHM(ADD, AST_IDENT("a"), AST_IDENT("b"))`，但此时不知道 a 和 b 是什么类型。

关键点：**有函数体的声明和没有函数体的声明在 AST 节点上有区分**（`body != NULL` vs `body == NULL`），这就是为什么 `syscall3` 的声明（只有 `;` 没有 `= { ... }`）能被正确识别为外部符号。

### 3.3 Check（语义分析）—— 最复杂阶段

这是编译器最核心的部分，占到 harec 约 40% 的代码量。它做以下几件事：

**声明解析算法**（`docs/declaration_solver.txt`）：
```
第一趟：收集所有 def 常量，求值
第二趟：收集类型声明，做"维度解析"（只计算 size/align）
第三趟：对所有声明做"完全解析"（检查类型、推断表达式类型）
第四趟：解析尚未完成的声明（用于互递归类型和循环引用）
```

**类型归约**：控制流汇合点时，需要确定结果的类型。例如：
```hare
let x = if (cond) 42 else "hello";
```
checker 需要在 `if` 的分支汇合处算出 `x` 的类型是 `(int | str)`——一个标记联合。

**类型存储**（`type_store.c`）：65536 个哈希桶做 hash-consing。相同类型参数生成指向同一个 `struct type` 的指针。类型相等性检查退化为指针相等性检查。

### 3.4 Gen（代码生成）

遍历 checked declaration 树，每个 Hare 表达式映射为 QBE IR 指令序列。

核心映射关系：

| Hare 概念 | QBE IR |
|-----------|--------|
| 函数 | `function $name { ... }` |
| 变量 | `%tmp =l alloc4 4` |
| 算术 | `%tmp =l add %a, %b` |
| 函数调用 | `%tmp =l call $fn(%a, %b)` |
| 条件分支 | `jnz %cond, @true, @false` |
| 返回 | `ret %val` |
| 内存加载/存储 | `%v =l loadl %ptr` / `storel %v, %ptr` |
| 聚合类型 | `%tmp =l loadl %ptr`（直接从栈上读，无 boxing） |

QBE IR 生成是直接 fprintf 文本——没有任何二进制中间格式。`gen.c` 逐行写入 QBE SSA 文本，这就是 harec 的最终输出。

---

## 四、qbe：.ssa → .s 的优化后端

qbe 是一个**教学级**的编译器后端。它的代码量只有 ~15000 行 C，但完整实现了现代编译器后端的所有关键阶段：

```
  .ssa (QBE IR 文本)
      │
      ▼
  parse.c     — 解析 QBE IR → 内存 IR
  cfg.c       — 构建控制流图（基本块 + 边）
  ssa.c       — SSA 构建（φ 节点放置）
  copy.c      — 复制传播（消除冗余 mov）
  fold.c      — 常量折叠
  simpl.c     — 简化（代数化简、强度削减）
  memdep.c    — 内存依赖分析
  rega.c      — 寄存器分配（线性扫描）
  emit.c      — 目标代码输出
      │
      ▼
  .s (AT&T 语法汇编)
```

qbe 的设计哲学：**小、简单、够用**。不追求 GCC/LLVM 级别的优化能力（自动向量化、PGO、LTO），专注于生成"不坏的"代码。这让它特别适合教学目的——一个人可以在几周内读完全部源码。

目标平台：`amd64/`（x86_64）、`arm64/`（AArch64）、`rv64/`（RISC-V 64）。每个目标的指令选择器把平台无关的 QBE IR 映射为平台特定的汇编。

---

## 五、运行时模型（rt/）：Hare 的"内核"

`rt/` 是 Hare 的标准运行时模块。它提供的是**语言本身不需要、但可执行程序必须有的东西**：

```
rt/
├── start.ha              # 程序入口逻辑（Hare 源码）
├── start+x86_64-linux.s  # _start 汇编入口
├── start+riscv64-linux.s # RISC-V 入口
├── hare.sc               # 链接脚本（控制 ELF 布局）
├── malloc.ha             # 内存分配器
├── memcpy.ha / memmove.ha / memset.ha  # 内存操作
├── ensure.ha / abort.ha  # 断言和异常终止
└── types.ha               # 基础类型别名
```

### 5.1 启动流程（hosted 环境）

```
内核 execve()
    │
    ▼
_start (汇编)                ← 栈上：argc, argv, envp
    │
    ├── 初始化栈对齐
    ├── 调用 rt::start_ha()（Hare 函数）
    │
    ▼
rt::start_ha()
    ├── 初始化全局变量（零初始化 + 显式初始值）
    ├── 按拓扑序执行 @init 函数
    ├── 调用 main()
    ├── 按反向拓扑序执行 @fini 函数
    └── exit(0)
```

关键：**不经过 glibc 的 `__libc_start_main`**。Hare 有自己的 `_start`，是完全独立的启动流程。这让 Hare 程序可以不依赖任何 libc 运行。

### 5.2 链接脚本

`hare.sc` 是 Hare 自带的链接脚本，定义了 ELF 文件的段布局：

```
.text    — 代码
.rodata  — 只读数据
.data    — 已初始化全局变量
.bss     — 零初始化全局变量
.init_array — @init 函数指针数组
.fini_array — @fini 函数指针数组
```

链接脚本还定义了 `__init_array_start` / `__init_array_end` 等符号，`rt::start_ha()` 通过遍历这些数组来执行初始化/清理函数。

---

## 六、系统调用层（sys/）：与内核对话

```
应用层 (io/, os/, fmt/, net/, ...)
    │  调用高级接口如 io::write(), os::open()
    ▼
os/+linux/              平台特定的文件系统、进程操作
    │  调用 sys::open(), sys::read(), sys::write()
    ▼
sys/+linux/syscalls.ha  高级 syscall 封装（有函数体的 Hare 函数）
    │  fn open(path: str, ...) = syscall4(SYS_openat, AT_FDCWD, ...)
    ▼
sys/+linux/syscalls.ha  syscall() 分发器
    │  根据参数个数分支调用 syscall0~syscall6
    ▼
sys/+linux/syscall+x86_64.s  手写汇编 syscall 指令
    │  movq %rdi, %rax; syscall; ret
    ▼
Linux 内核
```

### 6.1 ABI 转换

关键细节：C 调用约定（函数调用）和 syscall 约定（`syscall` 指令）使用**不同的寄存器**：

```
函数调用: fn(arg0: rdi, arg1: rsi, arg2: rdx, arg3: rcx, arg4: r8, arg5: r9)
syscall:  syscallno: rax, arg0: rdi, arg1: rsi, arg2: rdx, arg3: r10, arg4: r8, arg5: r9
```

`syscall3` 汇编需要做寄存器重排：

```asm
syscall3:
    movq %rdi, %rax    # fn 的第一个参数（syscall 号）→ %rax
    movq %rsi, %rdi    # fn 的第二个参数 → syscall 的第一个参数
    movq %rdx, %rsi    # fn 的第三个参数 → syscall 的第二个参数
    movq %rcx, %rdx    # fn 的第四个参数 → syscall 的第三个参数（rcx 被 syscall 指令 clobber）
    syscall
    ret
```

### 6.2 错误处理

Linux 内核的错误返回约定：错误时 `%rax` 返回负的 errno（范围 [-4095, -1]）。`wrap_return()` 检查这个范围，将错误转换为 Hare 的 tagged union 或直接 abort。

---

## 七、标准库分层架构

Hare 标准库的设计遵循**分层抽象**原则，每层只依赖下面的层：

```
┌─────────────────────────────────────────────┐
│  应用代码                                    │
├─────────────────────────────────────────────┤
│  net/  crypto/  encoding/  compress/  ...   │  ← 领域模块
├─────────────────────────────────────────────┤
│  fmt/  strings/  bytes/  path/  ...         │  ← 数据处理
├─────────────────────────────────────────────┤
│  io/                                        │  ← I/O 抽象层（io::handle）
├──────────────────┬──────────────────────────┤
│  os/             │  bufio/  memio/          │  ← 平台操作 / I/O 实现
├──────────────────┴──────────────────────────┤
│  fs/                                        │  ← 文件系统抽象
├─────────────────────────────────────────────┤
│  sys/                                       │  ← 系统调用绑定
├─────────────────────────────────────────────┤
│  rt/                                        │  ← 运行时
├─────────────────────────────────────────────┤
│  types/  math/  hash/  ...                  │  ← 基础类型/算法
└─────────────────────────────────────────────┘
```

关键是 `io::handle`——它是一个 vtable 分发机制（类似 Go 的 `io.Writer`）：

```hare
// io::write 是 Hare 的"万物皆可写"抽象
fn write(h: handle, buf: const []u8) (size | error);
```

文件、网络 socket、内存 buffer、压缩流——都实现了 `io::handle` 接口，上层代码不关心具体实现。

---

## 八、构建系统（hare build）

`hare build` 不是远程调度——它是**同一个进程内的函数调用**：

```
hare build myapp.ha
  │
  ├── 1. 解析命令行参数（cmd/hare/main.ha）
  ├── 2. 遍历模块依赖图
  │       └── 从 main.ha 开始，递归解析 use 声明
  ├── 3. 确定需要编译哪些源文件
  │       └── 比对源文件 mtime 和缓存中的 .ssa / .o mtime
  ├── 4. 调度并行编译任务
  │       ├── harec 编译 .ha → .ssa → .o（通过缓存）
  │       └── qbe + as 将 .ssa 转为 .o
  ├── 5. 链接
  │       ├── ld (binutils) — 默认
  │       └── cc (gcc/clang) — 当需要链接 .so 时
  └── 6. 输出可执行文件
```

关键设计：
- **缓存**：`HARECACHE` 目录下按模块→文件路径→平台组织，编译产物按需重用
- **并行化**：模块间无依赖的任务可并行执行
- **tags**：通过 `+linux` / `+freebsd` / `+x86_64` 等 build tags 选择平台代码

---

## 九、完整的端到端示例

以一个最简单的 Hare 程序为例：

```hare
// hello.ha
use io;
export fn main() void = {
    io::println("hello, world")!;
};
```

### 编译管线追踪

```
阶段 1: harec
  hello.ha
    → Lex: 28 个 token (use, io, ;, export, fn, main, (, ), void, =, {, ...)
    → Parse: AST 包含 2 个声明 (import io, fn main)
    → Check: 解析 io 模块导入，检查 main 函数签名，类型推断
    → Gen: fprintf QBE IR 到 .ssa

  .ssa 内容（简化）:
    export function $main() {
    @start.1
        %str =l call $rt.ensure(%global_str_ptr, %len)
        %ret =w call $io.println(%str)
        ret
    }

阶段 2: qbe
  main.ssa
    → parse: 解析 QBE IR 文本 → 内存 IR
    → cfg: 构建控制流图
    → ssa + copy + fold + simpl: SSA 构建 + 优化
    → rega: 寄存器分配
    → emit: 输出 x86_64 汇编

  main.s 内容（简化）:
    .globl main
    main:
        leaq    .Lstr(%rip), %rdi
        movl    $14, %esi
        callq   rt.ensure
        movq    %rax, %rdi
        callq   io.println
        xorl    %eax, %eax
        retq

阶段 3: as (GNU assembler)
  main.s → main.o (ELF64 relocatable object)

阶段 4: ld (GNU linker)
  链接: main.o + rt/*.o + io/*.o + fmt/*.o + sys/*.o + ...
  输出: hello (ELF64 executable)
```

### 最终 ELF 的内部结构

```
hello (ELF 可执行文件)
├── ELF Header
│   └── Entry point: _start (rt/start+x86_64-linux.s)
├── .text
│   ├── _start          (汇编)
│   ├── rt.start_ha     (Hare → 编译后)
│   ├── main            (Hare → 编译后)
│   ├── io.println      (Hare → 编译后)
│   ├── syscall3        (汇编 → syscall 指令)
│   └── syscall4        (汇编 → syscall 指令)
├── .rodata
│   ├── "hello, world\0"
│   └── 其他字符串常量
├── .init_array
│   └── @init 函数指针数组（按拓扑序排列）
├── .fini_array
│   └── @fini 函数指针数组
└── .dynamic (如果有动态链接)
```

运行时调用栈：

```
#0  syscall             (syscall 指令，内核态切换)
#1  syscall3            (汇编 wrapper)
#2  sys.write           (Hare 封装)
#3  io.write            (vtable 分发)
#4  io.println          (格式化 + 写入)
#5  main                (用户代码)
#6  rt.start_ha         (运行时入口)
#7  _start              (汇编入口，内核 execve 后第一条指令)
```

---

## 十、设计决策汇总：什么在什么不在

| 决策 | 在 harec 中 | 不在 harec 中 |
|------|-----------|-------------|
| **系统调用** | 生成 `Q_CALL` | 不做 syscall 指令生成（汇编处理） |
| **LLVM** | 不依赖 | 使用更简单的 QBE |
| **泛型** | 不支持（Hare 语言无泛型） | — |
| **自动向量化** | 不支持 | 交给 qbe |
| **链接时优化 (LTO)** | 不支持 | — |
| **C FFI** | 仅 @symbol 桥接 | 不做 C 头文件解析 |
| **GC** | 无 | 内存管理由程序员负责 |
| **异常** | 无 | 错误用 tagged union 返回 |
| **运行时反射** | 无 | — |

**核心取舍**：Hare 语言实现牺牲了功能完整性（无泛型、无 GC、无异常、无 LTO），换取了实现的简单性和可理解性。整个工具链（ha rec + qbe + hare 构建驱动）的代码量不到 10 万行——单个开发者可以在合理时间内完全理解。

---

## 十一、与其他语言实现的对比

| 维度 | Hare | Rust | Go | Zig |
|------|------|------|-----|-----|
| **编译器前端** | harec (C, ~30k行) | rustc (Rust, ~50万行) | gc (Go, ~20万行) | zig (Zig, ~25万行) |
| **后端** | qbe (~15k行 C) | LLVM (~400万行 C++) | 自带后端 | LLVM + 自带后端 |
| **标准库** | ~50个模块 | ~100+ crate | ~150 包 | ~50 模块 |
| **链接器** | 依赖系统 ld | 依赖系统 ld | 自带链接器 | 自带链接器 |
| **构建系统** | hare build | cargo | go build | zig build |
| **自举?** | 规划中（目前 harec 是 C） | 是 | 是（1.5 自举） | 是（自举） |
| **GC?** | 无 | 无 | 有 | 无 |
| **泛型?** | 无 | 有 | 有（简陋） | 有（comptime） |

Hare 在复杂性谱系中的位置很清晰：比 C 多构建系统和模块系统，比 Rust 少一个量级的复杂度，比 Zig 少 comptime 的元编程能力，比 Go 少运行时（GC、goroutine）。

---

## 十二、关键源码索引

| 你关心什么 | 从这里开始 |
|-----------|-----------|
| lexer 如何切 token | `harec/src/lex.c` — `lex()` 函数 |
| parser 如何构建 AST | `harec/src/parse.c` — `parse_expression()` |
| 类型检查怎么做 | `harec/src/check.c` — `check_expression()` |
| 声明解析算法 | `harec/docs/declaration_solver.txt` + `harec/src/check.c:check_declarations()` |
| IR 如何生成 | `harec/src/gen.c` — `gen_expression()` |
| 系统调用汇编 | `hare/sys/+linux/syscall+x86_64.s` |
| 程序入口 | `hare/rt/+linux/start+x86_64-linux.s` + `hare/rt/start.ha` |
| 链接脚本 | `hare/rt/+linux/hare.sc` |
| 构建驱动 | `hare/cmd/hare/main.ha` |
| QBE 如何做寄存器分配 | `qbe/rega.c` |
| QBE 如何输出 x86_64 汇编 | `qbe/amd64/emit.c` |
