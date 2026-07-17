import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { aiApi } from '@services/api'
import { formatApiError } from '@/utils'
import type { AIChatMessage } from '@/types'

const AI_CHAT_STORAGE_KEY = 'osushenie-ai-chat-messages'

const quickPrompts = [
  'Что ты умеешь?',
  'Дай краткую сводку по всем объектам.',
  'Есть ли риски?',
  'Кто сделал меньше всего задач?',
]

const initialMessages: AIChatMessage[] = [
  {
    role: 'assistant',
    content: [
      '## 👋 Я AI-ассистент администратора',
      '',
      'Могу помочь быстро понять, что происходит на объектах:',
      '',
      '- 📊 сделать сводку по объектам и задачам;',
      '- ⚠️ найти риски и проблемные места;',
      '- ⏰ показать просроченные задачи;',
      '- 👷 сравнить исполнителей и нагрузку;',
      '- ✅ подсказать, на что администратору обратить внимание.',
    ].join('\n'),
  },
]

const isAIChatMessage = (value: unknown): value is AIChatMessage => {
  if (typeof value !== 'object' || value === null || !('role' in value) || !('content' in value)) {
    return false
  }

  const message = value as Record<string, unknown>

  return (
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
  )
}

const loadStoredMessages = (): AIChatMessage[] => {
  const storedMessages = window.localStorage.getItem(AI_CHAT_STORAGE_KEY)
  if (!storedMessages) {
    return initialMessages
  }

  try {
    const parsedMessages: unknown = JSON.parse(storedMessages)
    if (!Array.isArray(parsedMessages) || !parsedMessages.every(isAIChatMessage)) {
      return initialMessages
    }

    return parsedMessages.length > 0 ? parsedMessages : initialMessages
  } catch {
    return initialMessages
  }
}

const MarkdownMessage = memo(({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ children }) => <h2 className="mt-5 text-2xl font-bold text-slate-950 first:mt-0">{children}</h2>,
      h2: ({ children }) => <h2 className="mt-5 text-2xl font-bold text-slate-950 first:mt-0">{children}</h2>,
      h3: ({ children }) => <h3 className="mt-4 text-xl font-bold text-slate-950 first:mt-0">{children}</h3>,
      h4: ({ children }) => <h3 className="mt-4 text-xl font-bold text-slate-950 first:mt-0">{children}</h3>,
      h5: ({ children }) => <h3 className="mt-4 text-xl font-bold text-slate-950 first:mt-0">{children}</h3>,
      h6: ({ children }) => <h3 className="mt-4 text-xl font-bold text-slate-950 first:mt-0">{children}</h3>,
      p: ({ children }) => <p className="my-2 break-words">{children}</p>,
      strong: ({ children }) => <strong className="font-bold text-slate-950">{children}</strong>,
      ul: ({ children }) => <ul className="my-3 list-disc space-y-2 pl-6">{children}</ul>,
      ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-6">{children}</ol>,
      li: ({ children }) => (
        <li className="pl-1 marker:text-[#ff4539]">
          {children}
        </li>
      ),
      table: ({ children }) => (
        <div className="my-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full border-collapse text-left text-sm">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-slate-100 text-slate-700">{children}</thead>,
      th: ({ children }) => <th className="border-b border-slate-200 px-4 py-3 font-bold">{children}</th>,
      td: ({ children }) => <td className="border-t border-slate-100 px-4 py-3 align-top text-slate-800">{children}</td>,
    }}
  >
    {content}
  </ReactMarkdown>
))

MarkdownMessage.displayName = 'MarkdownMessage'

const ChatMessageBubble = memo(({ message }: { message: AIChatMessage }) => {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[78%] overflow-hidden break-words rounded-3xl px-5 py-4 text-base leading-relaxed',
          isUser
            ? 'bg-[#ff4539] text-white'
            : 'border border-slate-200 bg-slate-50 text-slate-900',
        ].join(' ')}
      >
        {isUser ? message.content : <MarkdownMessage content={message.content} />}
      </div>
    </div>
  )
})

ChatMessageBubble.displayName = 'ChatMessageBubble'

function AiChatPage() {
  const [messages, setMessages] = useState<AIChatMessage[]>(loadStoredMessages)
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  const chatHistory = useMemo(
    () => messages.filter((message) => message.content.trim() !== ''),
    [messages],
  )
  const trimmedMessageText = useMemo(() => messageText.trim(), [messageText])
  const canSendMessage = trimmedMessageText.length > 0 && !loading

  const handleClearChat = () => {
    setMessages(initialMessages)
    setError('')
    window.localStorage.removeItem(AI_CHAT_STORAGE_KEY)
  }

  const sendMessage = async (text: string) => {
    const trimmedMessage = text.trim()
    if (!trimmedMessage || loading) return

    const nextMessages: AIChatMessage[] = [
      ...messages,
      {
        role: 'user',
        content: trimmedMessage,
      },
    ]

    setMessages(nextMessages)
    setMessageText('')
    setError('')
    setLoading(true)

    try {
      const response = await aiApi.sendMessage(trimmedMessage, chatHistory)
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: response.answer,
        },
      ])
    } catch (err) {
      const detail = (err as { response?: { data?: unknown } }).response?.data
      setError(formatApiError(detail, 'Не удалось получить ответ AI-ассистента.'))
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await sendMessage(messageText)
  }

  const handleQuickPromptClick = async (prompt: string) => {
    await sendMessage(prompt)
  }

  const handleMessageKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || !canSendMessage) {
      return
    }

    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3rem)] max-w-5xl flex-col gap-6 overflow-hidden">
      <div className="shrink-0 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">ИИ-инженер</h1>
          <p className="mt-2 max-w-3xl text-base text-slate-600">
            Чат для администратора: сводка по объектам, риски, просрочки и задачи, которые требуют внимания.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClearChat}
          className="cursor-pointer rounded-2xl border border-slate-300 px-5 py-3 text-base font-semibold text-slate-700 transition-colors duration-200 hover:bg-slate-100"
        >
          Очистить
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          {messages.map((message, index) => (
            <ChatMessageBubble key={`${message.role}-${index}`} message={message} />
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-base text-slate-500">
                Думаю...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="mx-6 mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
          {!loading && (
            <div className="mb-3 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleQuickPromptClick(prompt)}
                  className="cursor-pointer rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#ff4539]/40 hover:bg-[#ff4539]/10 hover:text-[#ff4539] hover:shadow-sm active:translate-y-0"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <textarea
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              onKeyDown={handleMessageKeyDown}
              rows={2}
              placeholder="Например: дай краткую сводку по всем объектам и покажи риски"
              className="min-h-14 flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none transition focus:border-[#ff4539] focus:ring-2 focus:ring-[#ff4539]/20"
            />
            <button
              type="submit"
              disabled={!canSendMessage}
              className={[
                'rounded-2xl px-6 py-3 text-base font-semibold text-white shadow-sm transition-[background-color,box-shadow,transform] duration-300 ease-out',
                canSendMessage
                  ? 'cursor-pointer bg-[#ff4539] hover:-translate-y-0.5 hover:bg-[#e63d32] hover:shadow-lg hover:shadow-[#ff4539]/25 active:translate-y-0'
                  : 'cursor-not-allowed bg-slate-300 shadow-none',
              ].join(' ')}
            >
              Отправить
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AiChatPage
