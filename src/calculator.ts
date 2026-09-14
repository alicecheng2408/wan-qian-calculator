import Decimal from 'decimal.js'

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP })

type Token = { type: 'number'; value: Decimal } | { type: 'op'; value: string }

export type SmartSuggestion = {
  start: number
  end: number
  original: string
  replacement: string
  value: string
  message: string
}

export class CalculatorError extends Error {}

const operators = new Set(['+', '-', '×', '÷', '(', ')'])
const unitMultiplier: Record<string, Decimal> = {
  千: new Decimal(1000),
  萬: new Decimal(10000),
}

export function findSuggestion(expression: string): SmartSuggestion | null {
  const match = /(?:^|[+\-×÷(])(-?\d+(?:\.\d+)?)萬(\d+)(千)?/.exec(expression)
  if (!match) return null
  const full = match[0]
  const prefixLength = full.length - `${match[1]}萬${match[2]}${match[3] ?? ''}`.length
  const start = (match.index ?? 0) + prefixLength
  const original = `${match[1]}萬${match[2]}${match[3] ?? ''}`
  const base = new Decimal(match[1])
  let value: Decimal
  let replacement: string

  if (match[3]) {
    value = base.times(10000).plus(new Decimal(match[2]).times(1000))
    replacement = value.div(10000).toDecimalPlaces(10).toString() + '萬'
  } else {
    replacement = `${match[1]}.${match[2]}萬`
    value = new Decimal(`${match[1]}.${match[2]}`).times(10000)
  }
  const valueText = formatResult(value)
  const message = match[3]
    ? `${original} 等於 ${valueText}，是否改寫為 ${replacement}？`
    : `是否要輸入 ${replacement}（${valueText}）？`
  return { start, end: start + original.length, original, replacement, value: valueText, message }
}

function tokenize(expression: string): Token[] {
  const compact = expression.replace(/[\s,]/g, '')
  if (!compact) throw new CalculatorError('請先輸入算式')
  if (findSuggestion(compact)) throw new CalculatorError('請先確認或修正中文單位')

  const tokens: Token[] = []
  let index = 0
  let expectingValue = true
  while (index < compact.length) {
    const char = compact[index]
    const unaryMinus = char === '-' && expectingValue
    if (/\d|\./.test(char) || unaryMinus) {
      const start = index
      if (unaryMinus) index++
      let dots = 0
      let digits = 0
      while (index < compact.length && /[\d.]/.test(compact[index])) {
        if (compact[index] === '.') dots++
        else digits++
        index++
      }
      if (!digits || dots > 1) throw new CalculatorError('數字格式不正確')
      let value: Decimal
      try { value = new Decimal(compact.slice(start, index)) }
      catch { throw new CalculatorError('數字格式不正確') }
      if (compact[index] === '千' || compact[index] === '萬') {
        value = value.times(unitMultiplier[compact[index]])
        index++
        if (compact[index] === '千' || compact[index] === '萬') throw new CalculatorError('同一數值不能連續使用單位')
      }
      tokens.push({ type: 'number', value })
      expectingValue = false
      continue
    }
    if (char === '(') {
      if (!expectingValue) throw new CalculatorError('數值與括號之間需要運算符')
      tokens.push({ type: 'op', value: char }); index++; expectingValue = true; continue
    }
    if (char === ')') {
      if (expectingValue) throw new CalculatorError('括號內容不完整')
      tokens.push({ type: 'op', value: char }); index++
      if (compact[index] === '千' || compact[index] === '萬') {
        tokens.push({ type: 'number', value: unitMultiplier[compact[index]] })
        tokens.splice(tokens.length - 1, 0, { type: 'op', value: '×' })
        index++
      }
      expectingValue = false; continue
    }
    if (operators.has(char) && !expectingValue && char !== '(' && char !== ')') {
      tokens.push({ type: 'op', value: char }); index++; expectingValue = true; continue
    }
    if (char === '千' || char === '萬') throw new CalculatorError('單位前需要數字或右括號')
    throw new CalculatorError(`無法辨識「${char}」`)
  }
  if (expectingValue) throw new CalculatorError('算式尚未完成')
  return tokens
}

export function calculate(expression: string): Decimal {
  const tokens = tokenize(expression)
  let position = 0
  const peek = () => tokens[position]
  const consume = () => tokens[position++]

  const primary = (): Decimal => {
    const token = consume()
    if (!token) throw new CalculatorError('算式尚未完成')
    if (token.type === 'number') return token.value
    if (token.value === '(') {
      const value = addSub()
      const closing = consume()
      if (!closing || closing.type !== 'op' || closing.value !== ')') throw new CalculatorError('括號不完整')
      return value
    }
    throw new CalculatorError('運算符位置不正確')
  }
  const mulDiv = (): Decimal => {
    let value = primary()
    while (peek()?.type === 'op' && ['×', '÷'].includes((peek() as { value: string }).value)) {
      const op = (consume() as { value: string }).value
      const right = primary()
      if (op === '÷' && right.isZero()) throw new CalculatorError('不能除以零')
      value = op === '×' ? value.times(right) : value.div(right)
    }
    return value
  }
  const addSub = (): Decimal => {
    let value = mulDiv()
    while (peek()?.type === 'op' && ['+', '-'].includes((peek() as { value: string }).value)) {
      const op = (consume() as { value: string }).value
      const right = mulDiv()
      value = op === '+' ? value.plus(right) : value.minus(right)
    }
    return value
  }
  const result = addSub()
  if (position !== tokens.length) throw new CalculatorError('括號或運算符位置不正確')
  if (result.sd() > 15) return result.toSignificantDigits(15)
  return result
}

export function formatResult(value: Decimal): string {
  if (!value.isFinite() || value.e > 99 || value.e < -99) throw new CalculatorError('數值過大')
  const scientific = value.abs().gte('1e15') || (value.abs().gt(0) && value.abs().lt('1e-10'))
  let raw = scientific
    ? value.toExponential(10).replace(/\.?(0+)e/, 'e')
    : value.toFixed(Math.max(0, Math.min(15, value.dp())))
  if (!scientific && raw.includes('.')) raw = raw.replace(/0+$/, '').replace(/\.$/, '')
  const [integer, decimal] = raw.split('.')
  if (raw.includes('e')) return raw
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (decimal ? `.${decimal}` : '')
}

export function evaluate(expression: string): string {
  return formatResult(calculate(expression))
}
