'use client';
import { createContext, useContext } from 'react';
import type { LanguageCode } from './types';

/**
 * The active study language, set once by AppShell and read by every component that
 * needs to branch on language (deck storage, dictionary lookups, TTS locale, level
 * labels). Avoids prop-drilling `language` through the whole tree.
 */
const LanguageContext = createContext<LanguageCode>('zh');

export const LanguageProvider = LanguageContext.Provider;
export const useLanguage = (): LanguageCode => useContext(LanguageContext);
