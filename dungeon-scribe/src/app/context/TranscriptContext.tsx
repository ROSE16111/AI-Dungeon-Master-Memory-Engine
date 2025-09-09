"use client";

//Save and update the results of "speech to text"
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";

type TranscriptCtxType = {
  transcript: string;
  setTranscript: Dispatch<SetStateAction<string>>; //
};

const TranscriptContext = createContext<TranscriptCtxType | null>(null);

export function TranscriptProvider({ children }: { children: ReactNode }) {
  const [transcript, setTranscript] = useState<string>("");

  return (
    <TranscriptContext.Provider value={{ transcript, setTranscript }}>
      {children}
    </TranscriptContext.Provider>
  );
}

export function useTranscript() {
  const ctx = useContext(TranscriptContext);
  if (!ctx) throw new Error("useTranscript must be inside TranscriptProvider");
  return ctx;
}
