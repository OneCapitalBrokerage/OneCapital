import { useEffect, useMemo, useRef, useState } from 'react';
import legalDocuments, { legalDocumentTabs } from '../../utils/legalDocuments';

const pillBaseClass =
  'inline-flex items-center justify-center whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition-colors';

const TabButton = ({ active, children, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`${pillBaseClass} ${
      active
        ? 'border-[#137fec] bg-[#137fec] text-white shadow-[0_10px_24px_rgba(19,127,236,0.22)]'
        : 'border-[#d6e3f4] bg-white text-[#46607d] hover:border-[#9dc4ee] hover:text-[#137fec]'
    }`}
  >
    {children}
  </button>
);

const LegalSectionCard = ({ index, section }) => (
  <section className="rounded-[24px] border border-[#e9eef5] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] sm:p-5">
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#137fec]/10 text-[12px] font-bold text-[#137fec]">
        {String(index + 1).padStart(2, '0')}
      </div>
      <h3 className="text-sm font-bold text-[#111418] sm:text-[15px]">{section.title}</h3>
    </div>

    {section.paragraphs?.length > 0 && (
      <div className="mt-3 space-y-2.5 text-[13px] leading-6 text-[#334155] sm:text-sm">
        {section.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    )}

    {section.bullets?.length > 0 && (
      <ul className="mt-3 space-y-2.5 text-[13px] leading-6 text-[#334155] sm:text-sm">
        {section.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#137fec]" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const LegalBottomSheet = ({ isOpen, defaultDocumentKey = 'terms', onClose }) => {
  const [activeDocumentKey, setActiveDocumentKey] = useState(defaultDocumentKey);
  const [activeLanguageKey, setActiveLanguageKey] = useState('en');
  const scrollRef = useRef(null);

  const documentOptions = useMemo(
    () => legalDocumentTabs.filter((tab) => legalDocuments[tab.key]),
    [],
  );

  useEffect(() => {
    if (!isOpen) return;
    setActiveDocumentKey(legalDocuments[defaultDocumentKey] ? defaultDocumentKey : 'terms');
  }, [defaultDocumentKey, isOpen]);

  useEffect(() => {
    const nextDocument = legalDocuments[activeDocumentKey] || legalDocuments.terms;
    const fallbackLanguage = nextDocument.defaultLanguage || Object.keys(nextDocument.languages || {})[0] || 'en';

    setActiveLanguageKey((current) => (nextDocument.languages?.[current] ? current : fallbackLanguage));
  }, [activeDocumentKey]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({ top: 0 });
  }, [activeDocumentKey, activeLanguageKey, isOpen]);

  const activeDocument = legalDocuments[activeDocumentKey] || legalDocuments.terms;
  const languageOptions = Object.entries(activeDocument.languages || {});
  const activeLanguage = activeDocument.languages?.[activeLanguageKey] || languageOptions[0]?.[1] || null;

  if (!isOpen || !activeDocument || !activeLanguage) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-bottom-sheet-title"
    >
      <div className="absolute inset-0 bg-[#08111c]/55 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[30px] bg-white shadow-[0_28px_80px_rgba(8,17,28,0.28)] sm:rounded-[30px]">
        <div className="flex justify-center pt-2 sm:hidden">
          <div className="h-1 w-12 rounded-full bg-[#c7d7eb]" />
        </div>

        <div className="border-b border-[#e6edf7] bg-[radial-gradient(circle_at_top_right,_rgba(19,127,236,0.16),_transparent_42%),linear-gradient(180deg,#f9fbff_0%,#ffffff_100%)] px-4 pb-4 pt-3 sm:px-6 sm:pb-5 sm:pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#137fec]/12 text-[#137fec]">
                <span className="material-symbols-outlined text-[22px]">{activeDocument.icon}</span>
              </div>
              <div className="min-w-0">
                <h2 id="legal-bottom-sheet-title" className="text-base font-bold text-[#111418] sm:text-[18px]">
                  {activeDocument.title}
                </h2>
                <p className="mt-1 text-xs leading-5 text-[#607287] sm:text-[13px]">{activeDocument.subtitle}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/90 text-[#5a6c82] shadow-[0_8px_20px_rgba(15,23,42,0.08)] transition-colors hover:text-[#111418]"
              aria-label="Close legal document"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {documentOptions.map((option) => (
              <TabButton
                key={option.key}
                active={option.key === activeDocumentKey}
                onClick={() => setActiveDocumentKey(option.key)}
              >
                {option.label}
              </TabButton>
            ))}
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {languageOptions.map(([languageKey, language]) => (
              <TabButton
                key={languageKey}
                active={languageKey === activeLanguageKey}
                onClick={() => setActiveLanguageKey(languageKey)}
              >
                {language.label}
              </TabButton>
            ))}
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5" lang={activeLanguage.locale}>
          <div className="space-y-3.5">
            {activeLanguage.sections.map((section, index) => (
              <LegalSectionCard key={`${activeLanguageKey}-${section.title}`} index={index} section={section} />
            ))}
          </div>
        </div>

        <div className="border-t border-[#e6edf7] bg-white px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="h-11 w-full rounded-2xl bg-[#137fec] text-sm font-semibold text-white shadow-[0_12px_30px_rgba(19,127,236,0.24)] transition hover:bg-[#0f73d6]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalBottomSheet;
