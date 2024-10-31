'use client'

import { useState, useRef, useEffect } from 'react'
import OpenAI from 'openai'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true // Required for client-side usage
})

// Add a console log to check if the API key is available
console.log('OpenAI API Key available:', !!process.env.NEXT_PUBLIC_OPENAI_API_KEY)

export default function Home() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [translation, setTranslation] = useState('')
  const [status, setStatus] = useState('Not Connected')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const lastTranscriptRef = useRef('')
  const [detectedLanguage, setDetectedLanguage] = useState('')

  const translateToKhasi = async (text: string) => {
    try {
      // Skip if it's the same as the last processed text
      if (text === lastTranscriptRef.current) {
        return
      }
      
      // Only translate phrases with more than 3 words
      if (text.split(' ').length <= 3) {
        return
      }

      // Update the last processed text
      lastTranscriptRef.current = text

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a translator. Translate the given English text to Khasi language. Only respond with the translation, no explanations."
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.3,
      })

      const translatedText = completion.choices[0]?.message?.content
      if (translatedText) {
        // Add newline before new translation
        setTranslation(prev => prev + (prev ? '\n' : '') + translatedText)
      }
    } catch (error) {
      console.error('Translation error:', error)
    }
  }

  const handleTranscriptUpdate = (transcriptText: string) => {
    setTranscript(prev => {
      // Add newline before new transcript
      const newTranscript = prev + (prev ? '\n' : '') + transcriptText
      // Only translate when we have a significant amount of new text
      if (transcriptText.split(' ').length > 3) {
        translateToKhasi(transcriptText.trim())
      }
      return newTranscript
    })
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        alert('Browser not supported')
        return
      }

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      })

      socketRef.current = new WebSocket(
        'wss://api.deepgram.com/v1/listen', [
        'token',
        process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY || ''
      ])

      socketRef.current.onopen = () => {
        setStatus('Connected')
        console.log({ event: 'onopen' })
        
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.addEventListener('dataavailable', async (event) => {
            if (event.data.size > 0 && socketRef.current?.readyState === 1) {
              socketRef.current.send(event.data)
            }
          })
          mediaRecorderRef.current.start(1000)
          setIsRecording(true)
        }
      }

      socketRef.current.onmessage = (message) => {
        const received = JSON.parse(message.data)
        const transcriptText = received.channel.alternatives[0].transcript
        
        // Get detected language if available
        if (received.channel?.detected_language) {
          setDetectedLanguage(received.channel.detected_language)
        }
        
        if (transcriptText && received.is_final) {
          console.log('Received final transcript:', transcriptText)
          console.log('Detected language:', received.channel?.detected_language)
          handleTranscriptUpdate(transcriptText)
        }
      }

      socketRef.current.onclose = () => {
        console.log({ event: 'onclose' })
        setStatus('Not Connected')
      }

      socketRef.current.onerror = (error) => {
        console.log({ event: 'onerror', error })
        setStatus('Error')
      }

    } catch (error) {
      console.error('Error:', error)
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
    }
    if (socketRef.current) {
      socketRef.current.close()
    }
    setIsRecording(false)
    setStatus('Not Connected')
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording()
      }
    }
  }, [isRecording])

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-8">Live Transcription & Translation</h1>
        
        <p className="mb-4" id="status">{status}</p>
        {detectedLanguage && (
          <p className="mb-4">Detected Language: {detectedLanguage}</p>
        )}
        
        <div className="mb-6">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-4 py-2 rounded-full ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-blue-500 hover:bg-blue-600'
            } text-white transition-colors`}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h2 className="font-semibold mb-2">Original Transcript:</h2>
            <p className="whitespace-pre-wrap">{transcript.trim()}</p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <h2 className="font-semibold mb-2">Khasi Translation:</h2>
            <p className="whitespace-pre-wrap">{translation.trim()}</p>
          </div>
        </div>
      </main>
    </div>
  )
}
