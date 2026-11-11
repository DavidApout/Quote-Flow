import { legalDetails, legalPages } from '../lib/legal';

export function LegalNotice({ account = false }) {
  return <p className="legal-notice">{account ? 'Demo account: use fictional information and a password you do not use elsewhere.' : 'Demo request: use fictional details and artwork you have permission to share.'} Read the <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">privacy notice</a> and <a href="/legal/terms" target="_blank" rel="noopener noreferrer">demo terms</a> before submitting. Links open in a new tab.</p>;
}

export default function LegalLinks() {
  return <footer className="legal-footer"><nav aria-label="Legal information">{legalPages.map(page => <a key={page.path} href={page.path} target="_blank" rel="noopener noreferrer">{page.label}<span className="sr-only"> (opens in a new tab)</span></a>)}<a href={`mailto:${legalDetails.email}`}>Contact</a></nav><p>QuoteFlow demo · United States · Test payments only.</p></footer>;
}
