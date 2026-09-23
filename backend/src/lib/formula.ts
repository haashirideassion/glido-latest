/**
 * Formula — a small, safe expression language.
 *
 * Two FRS requirements need tenant-authored expressions evaluated at runtime:
 *
 *   TF-08  the chargeable-quantity rule must be configurable, replacing the
 *          hard-coded MAX(kg/1000, CBM) — e.g. `MAX(weight_kg / weight_divisor, volume_cbm)`
 *   SC-04  conditional catalogue attachment needs a trigger expression —
 *          e.g. `days_on_site > dwell_threshold_days AND load_type == "lcl"`
 *
 * These come out of the database, which means they are tenant input and must
 * never reach `eval` or `new Function`. This is a hand-written tokeniser and
 * Pratt parser over a fixed grammar: numbers, strings, booleans, null,
 * identifiers, arithmetic, comparison, boolean logic and a closed set of
 * functions. There is no property access, no call into anything but the
 * whitelist, and no way to reach the host environment.
 *
 * Parsed ASTs are cached by source string — rating a booking evaluates the same
 * handful of formulas repeatedly.
 */

export type FormulaValue = number | string | boolean | null

export interface FormulaScope {
  [name: string]: FormulaValue | undefined
}

export class FormulaError extends Error {
  constructor(message: string, readonly source?: string, readonly position?: number) {
    super(message)
    this.name = 'FormulaError'
  }
}

// ── Tokeniser ────────────────────────────────────────────────────────────────

type TokenType = 'num' | 'str' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eof'

interface Token {
  type: TokenType
  value: string
  pos: number
}

const OPERATORS = [
  '<=', '>=', '==', '!=', '&&', '||',
  '+', '-', '*', '/', '%', '<', '>', '!',
]

function tokenise(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < src.length) {
    const ch = src[i]

    if (/\s/.test(ch)) { i++; continue }

    if (ch === '(') { tokens.push({ type: 'lparen', value: ch, pos: i++ }); continue }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch, pos: i++ }); continue }
    if (ch === ',') { tokens.push({ type: 'comma',  value: ch, pos: i++ }); continue }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const start = i
      while (i < src.length && /[0-9]/.test(src[i])) i++
      if (src[i] === '.') { i++; while (i < src.length && /[0-9]/.test(src[i])) i++ }
      tokens.push({ type: 'num', value: src.slice(start, i), pos: start })
      continue
    }

    if (ch === '"' || ch === "'") {
      const quote = ch
      const start = i++
      let out = ''
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < src.length) { out += src[i + 1]; i += 2 }
        else out += src[i++]
      }
      if (i >= src.length) throw new FormulaError('Unterminated string', src, start)
      i++ // closing quote
      tokens.push({ type: 'str', value: out, pos: start })
      continue
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++
      const word = src.slice(start, i)
      const lower = word.toLowerCase()
      // Word forms of the boolean operators, so tenants can write either.
      if (lower === 'and') { tokens.push({ type: 'op', value: '&&', pos: start }); continue }
      if (lower === 'or')  { tokens.push({ type: 'op', value: '||', pos: start }); continue }
      if (lower === 'not') { tokens.push({ type: 'op', value: '!',  pos: start }); continue }
      tokens.push({ type: 'ident', value: word, pos: start })
      continue
    }

    const op = OPERATORS.find(o => src.startsWith(o, i))
    if (op) {
      // A bare '=' is the mistake everyone makes; say so rather than failing obscurely.
      tokens.push({ type: 'op', value: op, pos: i })
      i += op.length
      continue
    }
    if (ch === '=') throw new FormulaError('Use == for comparison, not =', src, i)

    throw new FormulaError(`Unexpected character ${JSON.stringify(ch)}`, src, i)
  }

  tokens.push({ type: 'eof', value: '', pos: src.length })
  return tokens
}

// ── AST ──────────────────────────────────────────────────────────────────────

type Node =
  | { kind: 'literal'; value: FormulaValue }
  | { kind: 'var'; name: string }
  | { kind: 'unary'; op: string; operand: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[] }

// Binding powers. Higher binds tighter.
const BINARY_PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3, '!=': 3, '<': 3, '>': 3, '<=': 3, '>=': 3,
  '+': 4, '-': 4,
  '*': 5, '/': 5, '%': 5,
}

const KEYWORD_LITERALS: Record<string, FormulaValue> = {
  true: true, false: false, null: null,
}

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[], private readonly src: string) {}

  parse(): Node {
    const node = this.parseExpression(0)
    if (this.peek().type !== 'eof') {
      throw new FormulaError(`Unexpected ${JSON.stringify(this.peek().value)}`, this.src, this.peek().pos)
    }
    return node
  }

  private peek(): Token { return this.tokens[this.pos] }
  private next(): Token { return this.tokens[this.pos++] }

  private parseExpression(minPrecedence: number): Node {
    let left = this.parseUnary()
    for (;;) {
      const tok = this.peek()
      if (tok.type !== 'op') break
      const precedence = BINARY_PRECEDENCE[tok.value]
      if (precedence === undefined || precedence < minPrecedence) break
      this.next()
      const right = this.parseExpression(precedence + 1) // all operators left-associative
      left = { kind: 'binary', op: tok.value, left, right }
    }
    return left
  }

  private parseUnary(): Node {
    const tok = this.peek()
    if (tok.type === 'op' && (tok.value === '-' || tok.value === '!' || tok.value === '+')) {
      this.next()
      return { kind: 'unary', op: tok.value, operand: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Node {
    const tok = this.next()

    if (tok.type === 'num') return { kind: 'literal', value: Number(tok.value) }
    if (tok.type === 'str') return { kind: 'literal', value: tok.value }

    if (tok.type === 'lparen') {
      const inner = this.parseExpression(0)
      if (this.peek().type !== 'rparen') {
        throw new FormulaError('Expected )', this.src, this.peek().pos)
      }
      this.next()
      return inner
    }

    if (tok.type === 'ident') {
      const lower = tok.value.toLowerCase()
      if (lower in KEYWORD_LITERALS) {
        return { kind: 'literal', value: KEYWORD_LITERALS[lower] }
      }
      if (this.peek().type === 'lparen') {
        this.next()
        const args: Node[] = []
        if (this.peek().type !== 'rparen') {
          for (;;) {
            args.push(this.parseExpression(0))
            if (this.peek().type === 'comma') { this.next(); continue }
            break
          }
        }
        if (this.peek().type !== 'rparen') {
          throw new FormulaError(`Expected ) closing ${tok.value}(`, this.src, this.peek().pos)
        }
        this.next()
        return { kind: 'call', name: tok.value.toUpperCase(), args }
      }
      return { kind: 'var', name: tok.value }
    }

    throw new FormulaError(
      tok.type === 'eof' ? 'Unexpected end of expression' : `Unexpected ${JSON.stringify(tok.value)}`,
      this.src, tok.pos,
    )
  }
}

// ── Functions ────────────────────────────────────────────────────────────────

type FnImpl = (args: FormulaValue[], src: string) => FormulaValue

const FUNCTIONS: Record<string, { arity: [number, number]; impl: FnImpl }> = {
  MAX:   { arity: [1, 16], impl: a => Math.max(...a.map(numeric)) },
  MIN:   { arity: [1, 16], impl: a => Math.min(...a.map(numeric)) },
  ABS:   { arity: [1, 1],  impl: a => Math.abs(numeric(a[0])) },
  CEIL:  { arity: [1, 1],  impl: a => Math.ceil(numeric(a[0])) },
  FLOOR: { arity: [1, 1],  impl: a => Math.floor(numeric(a[0])) },
  ROUND: { arity: [1, 2],  impl: a => {
    const dp = a.length > 1 ? Math.trunc(numeric(a[1])) : 0
    const f = 10 ** dp
    return Math.round(numeric(a[0]) * f) / f
  } },
  IF:    { arity: [3, 3],  impl: a => (truthy(a[0]) ? a[1] : a[2]) },
  COALESCE: { arity: [1, 16], impl: a => a.find(v => v !== null && v !== undefined) ?? null },
  /** Days between two ISO dates, floored. */
  DAYS_BETWEEN: { arity: [2, 2], impl: a => {
    const from = Date.parse(String(a[0]))
    const to   = Date.parse(String(a[1]))
    if (Number.isNaN(from) || Number.isNaN(to)) return 0
    return Math.floor((to - from) / 86_400_000)
  } },
}

function numeric(v: FormulaValue): number {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  if (Number.isNaN(n)) throw new FormulaError(`Not a number: ${JSON.stringify(v)}`)
  return n
}

function truthy(v: FormulaValue): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null || v === undefined) return false
  return v !== '' && v.toLowerCase() !== 'false'
}

// ── Evaluation ───────────────────────────────────────────────────────────────

function evaluateNode(node: Node, scope: FormulaScope, src: string): FormulaValue {
  switch (node.kind) {
    case 'literal':
      return node.value

    case 'var': {
      if (!(node.name in scope)) {
        throw new FormulaError(`Unknown input "${node.name}"`, src)
      }
      return scope[node.name] ?? null
    }

    case 'unary': {
      const v = evaluateNode(node.operand, scope, src)
      if (node.op === '!') return !truthy(v)
      if (node.op === '-') return -numeric(v)
      return numeric(v)
    }

    case 'binary': {
      // Short-circuit, so `x != null && x > 5` is safe on a null x.
      if (node.op === '&&') {
        return truthy(evaluateNode(node.left, scope, src))
          ? truthy(evaluateNode(node.right, scope, src))
          : false
      }
      if (node.op === '||') {
        return truthy(evaluateNode(node.left, scope, src))
          ? true
          : truthy(evaluateNode(node.right, scope, src))
      }

      const l = evaluateNode(node.left, scope, src)
      const r = evaluateNode(node.right, scope, src)

      switch (node.op) {
        // Equality is loose across the null/undefined boundary only, so the
        // FRS's `storage_start_date != null` reads naturally.
        case '==': return looseEquals(l, r)
        case '!=': return !looseEquals(l, r)
        case '<':  return numeric(l) <  numeric(r)
        case '>':  return numeric(l) >  numeric(r)
        case '<=': return numeric(l) <= numeric(r)
        case '>=': return numeric(l) >= numeric(r)
        case '+':
          // String concatenation is deliberately not supported: a formula that
          // silently produces "12" instead of 3 is a pricing bug.
          return numeric(l) + numeric(r)
        case '-': return numeric(l) - numeric(r)
        case '*': return numeric(l) * numeric(r)
        case '/': {
          const d = numeric(r)
          if (d === 0) throw new FormulaError('Division by zero', src)
          return numeric(l) / d
        }
        case '%': {
          const d = numeric(r)
          if (d === 0) throw new FormulaError('Modulo by zero', src)
          return numeric(l) % d
        }
        default:
          throw new FormulaError(`Unsupported operator ${node.op}`, src)
      }
    }

    case 'call': {
      const fn = FUNCTIONS[node.name]
      if (!fn) throw new FormulaError(`Unknown function ${node.name}()`, src)
      const [minArity, maxArity] = fn.arity
      if (node.args.length < minArity || node.args.length > maxArity) {
        throw new FormulaError(
          `${node.name}() takes ${minArity === maxArity ? minArity : `${minArity}–${maxArity}`} argument(s), got ${node.args.length}`,
          src,
        )
      }
      // IF must not evaluate the branch it does not take.
      if (node.name === 'IF') {
        return truthy(evaluateNode(node.args[0], scope, src))
          ? evaluateNode(node.args[1], scope, src)
          : evaluateNode(node.args[2], scope, src)
      }
      return fn.impl(node.args.map(a => evaluateNode(a, scope, src)), src)
    }
  }
}

function looseEquals(l: FormulaValue, r: FormulaValue): boolean {
  const lNull = l === null || l === undefined || l === ''
  const rNull = r === null || r === undefined || r === ''
  if (lNull || rNull) return lNull && rNull
  if (typeof l === 'number' || typeof r === 'number') return numeric(l) === numeric(r)
  if (typeof l === 'boolean' || typeof r === 'boolean') return truthy(l) === truthy(r)
  return String(l).toLowerCase() === String(r).toLowerCase()
}

// ── Public API ───────────────────────────────────────────────────────────────

const astCache = new Map<string, Node>()
const AST_CACHE_LIMIT = 500

function parse(source: string): Node {
  const cached = astCache.get(source)
  if (cached) return cached
  const ast = new Parser(tokenise(source), source).parse()
  if (astCache.size >= AST_CACHE_LIMIT) astCache.clear()
  astCache.set(source, ast)
  return ast
}

/** Evaluate an expression to a value. Throws FormulaError on bad input. */
export function evaluateFormula(source: string, scope: FormulaScope): FormulaValue {
  return evaluateNode(parse(source), scope, source)
}

/** Evaluate to a number — the chargeable-quantity path (TF-08). */
export function evaluateNumeric(source: string, scope: FormulaScope): number {
  const v = evaluateFormula(source, scope)
  const n = numeric(v)
  if (!Number.isFinite(n)) throw new FormulaError(`Formula produced ${n}`, source)
  return n
}

/** Evaluate to a boolean — the conditional-attachment path (SC-04). */
export function evaluateCondition(source: string, scope: FormulaScope): boolean {
  return truthy(evaluateFormula(source, scope))
}

/**
 * Validate an expression without running it, and report which inputs it needs.
 * Backs the T-04 test panel: a tenant sees the error and the required inputs
 * before the formula can price anything.
 */
export function inspectFormula(source: string): {
  valid: boolean
  error?: string
  position?: number
  variables: string[]
  functions: string[]
} {
  try {
    const ast = new Parser(tokenise(source), source).parse()
    const variables = new Set<string>()
    const functions = new Set<string>()
    walk(ast, n => {
      if (n.kind === 'var') variables.add(n.name)
      if (n.kind === 'call') functions.add(n.name)
    })
    return { valid: true, variables: [...variables].sort(), functions: [...functions].sort() }
  } catch (err) {
    const fe = err as FormulaError
    return {
      valid: false,
      error: fe.message,
      position: fe.position,
      variables: [],
      functions: [],
    }
  }
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node)
  switch (node.kind) {
    case 'unary':  walk(node.operand, visit); break
    case 'binary': walk(node.left, visit); walk(node.right, visit); break
    case 'call':   node.args.forEach(a => walk(a, visit)); break
    default: break
  }
}

/** The functions a tenant may use, for the formula editor's help text. */
export const AVAILABLE_FUNCTIONS = Object.keys(FUNCTIONS).sort()
