import { useEffect, useMemo, useRef, useState } from 'react'
import { CalculatorError, evaluate, findSuggestion } from './calculator'

type Mode = 'editing' | 'result' | 'error'
const binaryOperators = ['+', '-', '×', '÷']

function App() {
  const [expression, setExpression] = useState('')
  const [result, setResult] = useState('0')
  const [mode, setMode] = useState<Mode>('editing')
  const [liveCalculation, setLiveCalculation] = useState(false)
  const [message, setMessage] = useState('')
  const [dismissedSuggestion, setDismissedSuggestion] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestion = useMemo(() => {
    const found = findSuggestion(expression)
    return found && found.original !== dismissedSuggestion ? found : null
  }, [expression, dismissedSuggestion])

  const focusAt = (position: number) => {
    requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus({ preventScroll: true })
      input.setSelectionRange(position, position)
      input.scrollLeft = input.scrollWidth
    })
  }

  const editExpression = (next: string, cursor: number) => {
    setExpression(next)
    setDismissedSuggestion('')
    if (liveCalculation) {
      try {
        setResult(evaluate(next))
        setMode('result')
        setMessage('答案已依最新算式即時更新')
      } catch {
        setMode('editing')
        setMessage('繼續輸入以完成算式')
      }
    } else {
      setMessage('')
      setMode('editing')
    }
    focusAt(cursor)
  }

  const replaceSelection = (text: string) => {
    const input = inputRef.current
    const start = input?.selectionStart ?? expression.length
    const end = input?.selectionEnd ?? start
    editExpression(expression.slice(0, start) + text + expression.slice(end), start + text.length)
  }

  const inputValue = (value: string) => {
    replaceSelection(value)
  }

  const backspace = () => {
    const input = inputRef.current
    const start = input?.selectionStart ?? expression.length
    const end = input?.selectionEnd ?? start
    if (start !== end) return editExpression(expression.slice(0, start) + expression.slice(end), start)
    if (start > 0) editExpression(expression.slice(0, start - 1) + expression.slice(start), start - 1)
  }

  const clear = () => {
    setExpression(''); setResult('0'); setMode('editing'); setLiveCalculation(false); setMessage(''); setDismissedSuggestion('')
    focusAt(0)
  }

  const toggleSign = () => {
    const input = inputRef.current
    const cursor = input?.selectionStart ?? expression.length
    const before = expression.slice(0, cursor)
    const match = /(-?\d+(?:\.\d+)?(?:千|萬)?)$/.exec(before)
    if (!match) return setMessage('請先輸入要切換正負號的數字')
    const start = cursor - match[0].length
    const replacement = match[0].startsWith('-') ? match[0].slice(1) : `-${match[0]}`
    editExpression(expression.slice(0, start) + replacement + expression.slice(cursor), start + replacement.length)
  }

  const insertParenthesis = () => {
    const before = expression.slice(0, inputRef.current?.selectionStart ?? expression.length)
    const opens = [...before].filter((x) => x === '(').length
    const closes = [...before].filter((x) => x === ')').length
    const last = before.at(-1)
    const shouldClose = opens > closes && last !== '(' && last !== undefined && !binaryOperators.includes(last)
    inputValue(shouldClose ? ')' : '(')
  }

  const solve = () => {
    if (suggestion) {
      setMode('error'); setMessage('請先套用或取消單位建議，再修正算式'); return
    }
    try {
      setResult(evaluate(expression)); setMode('result'); setMessage('')
      setLiveCalculation(true)
      inputRef.current?.blur()
    } catch (error) {
      setMode('error')
      setMessage(error instanceof CalculatorError ? error.message : '算式無法計算')
    }
  }

  const applySuggestion = () => {
    if (!suggestion) return
    const next = expression.slice(0, suggestion.start) + suggestion.replacement + expression.slice(suggestion.end)
    editExpression(next, suggestion.start + suggestion.replacement.length)
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const mapped: Record<string, string> = { '*': '×', '/': '÷' }
      if (/^[0-9.+-]$/.test(event.key) || ['*', '/', '(', ')'].includes(event.key)) {
        event.preventDefault(); inputValue(mapped[event.key] ?? event.key)
      } else if (event.key === 'Enter' || event.key === '=') {
        event.preventDefault(); solve()
      } else if (event.key === 'Escape') clear()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const keys = [
    ['C', clear, 'function'], ['( )', insertParenthesis, 'function'], ['⌫', backspace, 'function'], ['÷', () => inputValue('÷'), 'operator'],
    ['7', () => inputValue('7'), 'number'], ['8', () => inputValue('8'), 'number'], ['9', () => inputValue('9'), 'number'], ['×', () => inputValue('×'), 'operator'],
    ['4', () => inputValue('4'), 'number'], ['5', () => inputValue('5'), 'number'], ['6', () => inputValue('6'), 'number'], ['−', () => inputValue('-'), 'operator'],
    ['1', () => inputValue('1'), 'number'], ['2', () => inputValue('2'), 'number'], ['3', () => inputValue('3'), 'number'], ['+', () => inputValue('+'), 'operator'],
    ['+/−', toggleSign, 'number'], ['0', () => inputValue('0'), 'number'], ['.', () => inputValue('.'), 'number'], ['=', solve, 'equals'],
  ] as const

  return (
    <main className="calculator">
      <section className="display" aria-label="計算顯示區">
        <label htmlFor="expression" className="eyebrow">計算流程</label>
        <input
          ref={inputRef}
          id="expression"
          className="expression"
          value={expression}
          placeholder="點選按鍵開始計算"
          inputMode="none"
          spellCheck={false}
          aria-label="可編輯的計算算式"
          onChange={(event) => editExpression(event.target.value.replace(/\*/g, '×').replace(/\//g, '÷'), event.target.selectionStart ?? event.target.value.length)}
        />
        <div className={`answer ${mode === 'result' ? 'is-result' : ''}`} aria-live="polite">
          <span className="answer-label">{mode === 'result' ? '答案' : mode === 'error' ? '無法計算' : '目前數值'}</span>
          <output>{mode === 'result' ? result : expression || '0'}</output>
        </div>
        <p className={`status ${mode === 'error' ? 'is-error' : ''}`} aria-live="assertive">{message || '\u00a0'}</p>
      </section>

      <section className="controls" aria-label="計算按鍵">
        <div className={`suggestion ${suggestion ? 'is-visible' : ''}`} aria-hidden={!suggestion}>
          {suggestion && <>
            <p>{suggestion.message}</p>
            <div><button onClick={() => { setDismissedSuggestion(suggestion.original); setMessage('請將模糊的單位寫法修正後再計算') }}>取消</button><button className="apply" onClick={applySuggestion}>套用</button></div>
          </>}
        </div>
        <div className="unit-row" aria-label="中文單位快捷鍵">
          <span>快速輸入單位</span>
          <button onClick={() => inputValue('千')} aria-label="輸入千，乘以一千">千 <small>×1,000</small></button>
          <button onClick={() => inputValue('萬')} aria-label="輸入萬，乘以一萬">萬 <small>×10,000</small></button>
        </div>
        <div className="keypad">
          {keys.map(([label, action, kind]) => <button key={label} className={`key ${kind}`} onClick={action} aria-label={label === '⌫' ? '退格刪除' : label}>{label}</button>)}
        </div>
      </section>
    </main>
  )
}

export default App
