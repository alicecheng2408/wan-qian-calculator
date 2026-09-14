import { describe, expect, it } from 'vitest'
import { calculate, evaluate, findSuggestion } from './calculator'

describe('精準計算', () => {
  it.each([
    ['8.8萬', '88,000'], ['2.5千', '2,500'], ['0萬', '0'], ['-3萬', '-30,000'],
    ['(2+3)萬', '50,000'], ['0.1+0.2', '0.3'], ['2+3×4', '14'], ['(2+3)×4', '20'],
    ['100+20', '120'], ['1.2300+0', '1.23'],
  ])('%s = %s', (expression, result) => expect(evaluate(expression)).toBe(result))

  it('限制為 15 位有效數字', () => expect(calculate('1÷3').sd()).toBeLessThanOrEqual(15))
  it.each(['1÷0', '(2+3', '1..2+3', '8萬千', '8萬5'])('拒絕不合法算式 %s', (expression) => {
    expect(() => evaluate(expression)).toThrow()
  })
})

describe('智慧單位建議', () => {
  it('辨識 3萬5', () => expect(findSuggestion('3萬5')).toMatchObject({ replacement: '3.5萬', value: '35,000' }))
  it('辨識 3萬5千', () => expect(findSuggestion('3萬5千')).toMatchObject({ replacement: '3.5萬', value: '35,000' }))
  it('可辨識算式中的片段', () => expect(findSuggestion('2千+3萬5')?.start).toBe(3))
})
