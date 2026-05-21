'use client'

import { useState, useRef, useEffect } from 'react'

type AgentMsg = {
  type: 'agent_message'
  id: string
  display_name: string
  role: string
  content: string
}
type DoneMsg = { type: 'done'; stop_reason: string }
type SessionEnd = { type: 'session_end' }
type ErrorMsg = { type: 'error'; message: string }
type WsMsg = AgentMsg | DoneMsg | SessionEnd | ErrorMsg

const AVATAR: Record<string, string> = {
  pm: '👔',
  seo: '🔍',
  dev: '💻',
}

export default function Home() {
  const [mission, setMission] = useState('')
  const [messages, setMessages] = useState<AgentMsg[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [stopReason, setStopReason] = useState('')
  const wsRef = useRef<WebSocket | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  const startMeeting = () => {
    if (!mission.trim() || status === 'running') return
    setMessages([])
    setStopReason('')
    setStatus('running')

    const host = window.location.hostname
    const ws = new WebSocket(`ws://${host}:8000/ws`)
    wsRef.current = ws

    ws.onopen = () => ws.send(JSON.stringify({ type: 'start', mission }))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as WsMsg
      if (msg.type === 'agent_message') {
        setMessages((prev) => [...prev, msg])
      } else if (msg.type === 'done') {
        setStatus('done')
        setStopReason(msg.stop_reason)
      } else if (msg.type === 'error') {
        setStatus('error')
        setStopReason(msg.message)
      } else if (msg.type === 'session_end') {
        ws.close()
      }
    }
    ws.onerror = () => setStatus('error')
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">🏢 AI 회사 회의방</h1>
        <p className="text-sm text-slate-500 mb-6">
          PM · SEO · 개발자 3명이 자율 회의합니다.
        </p>

        <div className="flex gap-2 mb-6 sticky top-2 z-10">
          <input
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startMeeting()}
            placeholder="예: scorebase 에 NBA 라이브 페이지 추가하려는데 어떻게 접근?"
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg bg-white"
            disabled={status === 'running'}
          />
          <button
            onClick={startMeeting}
            disabled={status === 'running' || !mission.trim()}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700"
          >
            {status === 'running' ? '회의 중...' : '회의 시작'}
          </button>
        </div>

        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
              <div className="text-sm text-slate-500 mb-1.5 flex items-center gap-2">
                <span className="text-lg">{AVATAR[m.id] || '🤖'}</span>
                <b className="text-slate-700">{m.display_name}</b>
                <span className="text-slate-400">· {m.role}</span>
              </div>
              <div className="whitespace-pre-wrap text-slate-800 leading-relaxed">
                {m.content}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {status === 'running' && (
          <div className="mt-6 text-slate-500 text-sm">⏳ 회의 진행 중... (각 발언당 3~10초 소요)</div>
        )}
        {status === 'done' && (
          <div className="mt-6 p-3 bg-green-50 text-green-700 text-sm rounded-lg">
            ✅ 회의 종료 {stopReason && `· ${stopReason}`}
          </div>
        )}
        {status === 'error' && (
          <div className="mt-6 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
            ❌ {stopReason || '에러 발생'}
          </div>
        )}
      </div>
    </div>
  )
}
