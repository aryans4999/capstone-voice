"use client"

import { useChat } from "@ai-sdk/react"
import { Persona, type PersonaState } from "@/components/ai-elements/persona"
import { SpeechInput } from "@/components/ai-elements/speech-input"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEffect, useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Volume2Icon, VolumeXIcon, LanguagesIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

function useKokoro(lang: "en" | "hi") {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return

      try {
        const response = await fetch("http://localhost:8002/tts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            voice: lang === "hi" ? "hf_alpha" : "af_heart",
            lang,
          }),
        })

        if (!response.ok) {
          throw new Error(`TTS Server error: ${response.statusText}`)
        }

        const blob = await response.blob()
        const url = URL.createObjectURL(blob)

        if (audioRef.current) {
          audioRef.current.src = url
          audioRef.current.play().catch(console.error)
          setIsPlaying(true)
        }
      } catch (error) {
        console.error("TTS Fetch Error:", error)
        setIsPlaying(false)
      }
    },
    [lang]
  )

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsPlaying(false)
    }
  }, [])

  return { speak, stop, isPlaying, setIsPlaying, audioRef }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks entirely
    .replace(/`([^`]+)`/g, "$1") // Remove inline code markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links
    .replace(/[*_~`>#]/g, "") // Remove common symbols
    .replace(/^[*-]\s/gm, "") // Remove bullets
    .replace(/^\d+\.\s/gm, "") // Remove numbered lists
    .replace(/\n+/g, " ") // Newlines to spaces
    .replace(/[^\w\s\u0900-\u097F.,!?]/g, "") // Keep only letters, numbers, spaces, punctuation and Hindi chars
    .trim()
}

function normalizeNumbersForTTS(text: string): string {
  // Space out digits to force individual pronunciation (e.g., "123" -> "1 2 3")
  // Handle English digits (0-9) and Hindi digits (०-९)
  return text
    .replace(/\d/g, (match) => `${match} `)
    .replace(/[\u0966-\u096F]/g, (match) => `${match} `)
    .replace(/\s+/g, " ")
    .trim()
}

function prepareTextForTTS(text: string): string {
  // Expand contractions that might sound better when fully pronounced
  const expanded = text
    .replace(/\bI'm\b/gi, "I am")
    .replace(/\bI'll\b/gi, "I will")
  const cleaned = stripMarkdown(expanded)
  return normalizeNumbersForTTS(cleaned)
}

/**
 * Custom UI component for Tool results to make them look like proper "UI parts"
 */
function ToolResultUI({ toolName, result }: { toolName: string; result: any }) {
  // We can customize the UI based on the tool name
  const title = toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())

  return (
    <Tool defaultOpen className="w-full border-primary/20 shadow-sm">
      <ToolHeader
        type="dynamic-tool"
        state="output-available"
        toolName={toolName}
        title={title}
      />
      <ToolContent>
        <ToolOutput output={result} errorText={null} />
      </ToolContent>
    </Tool>
  )
}

export default function Page() {
  const [lang, setLang] = useState<"en" | "hi">("en")
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true)
  const { speak, stop, isPlaying, setIsPlaying, audioRef } = useKokoro(lang)
  const [personaState, setPersonaState] = useState<PersonaState>("idle")
  const [isListening, setIsListening] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    sendMessage,
    stop: stopChat,
    status,
  } = useChat({
    body: {
      lang,
    },
    onFinish: ({ message }) => {
      if (isVoiceEnabled && message.role === "assistant") {
        const text = message.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(" ")
        if (text) speak(prepareTextForTTS(text))
      }
    },
  })

  // Update Persona state with proper priority
  useEffect(() => {
    // 1. Speaking takes highest priority (audio playing or text streaming)
    if (isPlaying || status === "streaming") {
      setPersonaState("speaking")
    }
    // 2. Thinking takes priority when AI is processing
    else if (status === "submitted") {
      setPersonaState("thinking")
    }
    // 3. Listening takes priority when user is talking
    else if (isListening) {
      setPersonaState("listening")
    }
    // 4. Fallback to idle
    else {
      setPersonaState("idle")
    }
  }, [status, isPlaying, isListening])

  const handleTranscription = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      stop()
      await stopChat()

      const instruction =
        lang === "hi"
          ? "कृपया हिंदी में उत्तर दें: "
          : "Please respond in English: "

      await sendMessage({ text: instruction + text })
    },
    [sendMessage, stop, stopChat, lang]
  )

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      )
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [messages, status])

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground md:flex-row">
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        hidden
      />

      {/* Left Column: Persona & Controls */}
      <div className="flex w-full flex-col items-center justify-center gap-8 border-b bg-muted/10 p-6 md:w-1/3 md:border-r md:border-b-0 md:p-12 lg:w-2/5">
        <header className="absolute top-6 left-6 flex w-full items-center justify-between md:relative md:top-0 md:left-auto md:mb-8">
          <div className="flex flex-col">
            <h1 className="text-xl font-semibold tracking-tight">
              Aeviox Live
            </h1>
            <p className="text-xs text-muted-foreground">Aeviox + Kokoro TTS</p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLang((l) => (l === "en" ? "hi" : "en"))}
              className="flex items-center gap-2 font-medium"
            >
              <LanguagesIcon className="size-4" />
              {lang === "en" ? "English" : "हिंदी"}
            </Button>

            <div className="flex items-center gap-2 border-l pl-4">
              {isVoiceEnabled ? (
                <Volume2Icon className="size-4 text-primary" />
              ) : (
                <VolumeXIcon className="size-4 text-muted-foreground" />
              )}
              <Switch
                checked={isVoiceEnabled}
                onCheckedChange={setIsVoiceEnabled}
                id="voice-mode"
              />
            </div>
          </div>
        </header>

        <div className="relative flex flex-col items-center gap-8 py-12 md:py-0">
          <Persona
            className="size-64 md:size-80 lg:size-96"
            state={personaState}
            variant="obsidian"
          />
          {(status === "streaming" || status === "submitted") && (
            <div className="absolute -bottom-12 left-1/2 w-full -translate-x-1/2 animate-pulse text-center text-sm font-medium text-primary/70">
              {status === "submitted" ? "Thinking..." : "Responding..."}
            </div>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <SpeechInput
            className="size-20 shadow-lg shadow-primary/20 md:size-24"
            onTranscriptionChange={handleTranscription}
            onListeningChange={setIsListening}
            lang={lang === "en" ? "en-US" : "hi-IN"}
            variant="default"
          />
          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
            {lang === "en" ? "Tap to Speak" : "बोलने के लिए टैप करें"}
          </p>
        </div>
      </div>

      {/* Right Column: Conversation History */}
      <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-background">
        <div className="absolute inset-0 p-4 md:p-8">
          <ScrollArea ref={scrollRef} className="h-full w-full pr-4">
            <div className="flex flex-col gap-8 pb-12">
              {messages.length === 0 && (
                <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
                  <p className="text-lg text-muted-foreground">
                    {lang === "en"
                      ? "Start a conversation"
                      : "बातचीत शुरू करें"}
                  </p>
                  <p className="max-w-xs text-sm text-muted-foreground/60">
                    {lang === "en"
                      ? "Try asking about insurance claims or user details."
                      : "बीमा दावों या उपयोगकर्ता विवरणों के बारे में पूछने का प्रयास करें।"}
                  </p>
                </div>
              )}
              {messages.map((m) => (
                <Message
                  key={m.id}
                  from={m.role}
                  className={cn(
                    "max-w-full",
                    m.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  {m.parts.map((part, index) => {
                    if (part.type === "text") {
                      return (
                        <MessageContent
                          key={index}
                          className={cn(
                            "text-base md:text-lg",
                            m.role === "user"
                              ? "text-muted-foreground"
                              : "text-foreground"
                          )}
                        >
                          <MessageResponse>{part.text}</MessageResponse>
                        </MessageContent>
                      )
                    }

                    if (part.type === "tool-call") {
                      return (
                        <Tool
                          key={part.toolCallId}
                          className="w-full max-w-md opacity-50 grayscale transition-all hover:opacity-100 hover:grayscale-0"
                        >
                          <ToolHeader
                            type="dynamic-tool"
                            state="input-available"
                            toolName={part.toolName}
                          />
                          <ToolContent>
                            <ToolInput input={part.args} />
                          </ToolContent>
                        </Tool>
                      )
                    }

                    if (part.type === "tool-result") {
                      return (
                        <ToolResultUI
                          key={part.toolCallId}
                          toolName={part.toolName}
                          result={part.result}
                        />
                      )
                    }

                    return null
                  })}
                </Message>
              ))}

              {(status === "streaming" || status === "submitted") &&
                !messages.some(
                  (m) =>
                    m.role === "assistant" &&
                    m.parts.some((p) => p.type === "text" && p.text)
                ) && (
                  <Message from="assistant" className="items-start">
                    <MessageContent>
                      <div className="flex items-center gap-1 px-1 py-2">
                        <span className="size-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:-0.3s]"></span>
                        <span className="size-1.5 animate-bounce rounded-full bg-primary/50 [animation-delay:-0.15s]"></span>
                        <span className="size-1.5 animate-bounce rounded-full bg-primary/50"></span>
                      </div>
                    </MessageContent>
                  </Message>
                )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </main>
  )
}
