import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/sections/hero";
import { Services } from "@/components/sections/services";
import { Audience } from "@/components/sections/audience";
import { Portfolio } from "@/components/sections/portfolio";
import { Process } from "@/components/sections/process";
import { Quote } from "@/components/sections/quote";
import { Contact } from "@/components/sections/contact";
import { Footer } from "@/components/footer";
import { isQuoteSubmissionEnabled } from "@/lib/quote/config";
import { brandJsonLd, DEFAULT_DESCRIPTION, HOME_TITLE, jsonLdScript, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: { absolute: HOME_TITLE },
  description: DEFAULT_DESCRIPTION,
  path: "/",
});

export default function Home() {
  const quoteEnabled = isQuoteSubmissionEnabled();
  const jsonLd = brandJsonLd();

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      )}
      <Navbar quoteEnabled={quoteEnabled} />
      <main>
        <Hero quoteEnabled={quoteEnabled} />
        <Services />
        <Audience />
        {/* Portfolio and Contact render nothing until their data is set. */}
        <Portfolio />
        <Process />
        <Quote quoteEnabled={quoteEnabled} />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
