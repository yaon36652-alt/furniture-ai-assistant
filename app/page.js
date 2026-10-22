import fs from 'node:fs';
import path from 'node:path';
import Script from 'next/script';

const source = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const bodyMarkup = source.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1]
  ?.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '') || '';

export default function HomePage() {
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: bodyMarkup }} />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
