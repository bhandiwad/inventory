"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import type { TranscriptResult } from "@/lib/voice";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function VoiceControl({
  canUse,
  onTranscript,
  onError,
  transcribeAudio
}: {
  canUse: boolean;
  onTranscript(result: TranscriptResult): Promise<void> | void;
  onError(message: string): void;
  transcribeAudio(audio: Blob): Promise<TranscriptResult>;
}) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sarvamConfigured, setSarvamConfigured] = useState(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    fetch("/api/voice/status")
      .then((response) => response.json())
      .then((data) => setSarvamConfigured(Boolean(data.sarvamConfigured)))
      .catch(() => setSarvamConfigured(false));
  }, []);

  function supportedRecorderMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/aac"
    ];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
  }

  function stopStream(stream: MediaStream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  function microphoneErrorMessage(error: unknown) {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError" || error.name === "SecurityError") {
        return "Microphone is blocked. Allow microphone access for this site in the browser address bar.";
      }
      if (error.name === "NotFoundError") {
        return "No microphone was found on this device.";
      }
      if (error.name === "NotReadableError") {
        return "Microphone is being used by another app.";
      }
    }
    return "Could not start microphone on this browser.";
  }

  async function start() {
    if (!canUse || recording || processing) return;
    startedAtRef.current = Date.now();
    if (sarvamConfigured && navigator.mediaDevices && typeof MediaRecorder !== "undefined") {
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const activeStream = stream;
        const mimeType = supportedRecorderMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunksRef.current.push(event.data);
        };
        recorder.onstop = async () => {
          stopStream(activeStream);
          setRecording(false);
          setProcessing(true);
          try {
            const audio = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
            if (audio.size < 512) {
              throw new Error("I did not catch any audio. Tap the mic, speak, then tap again.");
            }
            await onTranscript(await transcribeAudio(audio));
          } catch (error) {
            onError(error instanceof Error ? error.message : "Voice transcription failed");
          } finally {
            setProcessing(false);
          }
        };
        recorderRef.current = recorder;
        recorder.start(250);
        setRecording(true);
        return;
      } catch (error) {
        if (stream) stopStream(stream);
        setRecording(false);
        onError(microphoneErrorMessage(error));
        return;
      }
    }

    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-IN";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = async (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setProcessing(true);
          await onTranscript({ transcript, language: "en-IN", latencyMs: Date.now() - startedAtRef.current, provider: "web-speech" });
          setProcessing(false);
        }
      };
      recognition.onerror = () => {
        setRecording(false);
        onError("Could not hear that clearly");
      };
      recognition.onend = () => setRecording(false);
      recognitionRef.current = recognition;
      recognition.start();
      return;
    }
    setRecording(false);
    onError("Voice is not supported in this browser");
  }

  function stop() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      return;
    }
    if (recorderRef.current?.state === "recording") {
      const elapsed = Date.now() - startedAtRef.current;
      if (elapsed < 700) {
        window.setTimeout(stop, 700 - elapsed);
        return;
      }
      recorderRef.current.requestData();
      recorderRef.current.stop();
    }
  }

  function toggleRecording() {
    if (recording) {
      stop();
      return;
    }
    start();
  }

  return (
    <button
      aria-label={recording ? "Stop and match voice" : "Start voice input"}
      className={`fixed bottom-20 left-1/2 z-40 grid h-14 w-14 -translate-x-1/2 place-items-center rounded-full shadow-soft ${recording ? "bg-red-600 text-white" : canUse ? "bg-leaf text-white" : "bg-zinc-300 text-zinc-600"}`}
      disabled={!canUse || processing}
      onClick={toggleRecording}
      title={canUse ? (recording ? "Tap again to match voice" : "Tap to speak") : "Viewer cannot use voice"}
    >
      <Mic size={24} />
    </button>
  );
}
