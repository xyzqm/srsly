'use client';
import { useState, useRef, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

export function useMic(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const language = useLanguage();
  const recRef = useRef<SR | null>(null);
  const lastFinalRef = useRef('');

  const toggle = useCallback((currentInput: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) return;

    if (listening) {
      recRef.current?.stop();
      return;
    }

    lastFinalRef.current = currentInput.trim();
    const rec = new SR();
    rec.lang = getLanguageConfig(language).bcp47;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    recRef.current = rec;

    rec.onstart = () => setListening(true);
    rec.onend = () => {
      setListening(false);
      onResult(lastFinalRef.current.trim());
    };
    rec.onerror = () => {
      setListening(false);
      onResult(lastFinalRef.current.trim());
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let finals = lastFinalRef.current;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finals += e.results[i][0].transcript;
        else interim = e.results[i][0].transcript;
      }
      lastFinalRef.current = finals;
      onResult(finals + (interim ? ` […${interim}]` : ''));
    };

    try { rec.start(); } catch { /* already started */ }
  }, [listening, onResult, language]);

  const supported = typeof window !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return { listening, toggle, supported };
}
