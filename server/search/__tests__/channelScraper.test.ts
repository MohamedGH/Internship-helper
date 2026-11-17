import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverChannelsFromUrl } from '../channelScraper.ts';

test('discoverChannelsFromUrl inspects authorized offer and official career/contact pages for recruiting emails, JSON-LD contacts, ATS forms, and HTML contact forms', async () => {
  const pages: Record<string, string> = {
    'https://acme-ai.example/jobs/stage-backend': `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "title": "Stage Backend Python",
              "hiringOrganization": {
                "@type": "Organization",
                "name": "Acme AI",
                "url": "https://acme-ai.example"
              },
              "applicationContact": {
                "@type": "ContactPoint",
                "name": "Claire Martin",
                "email": "claire.martin@acme-ai.example"
              }
            }
          </script>
        </head>
        <body>
          <p>Ignore noreply@acme-ai.example. Apply via ATS or our contact page.</p>
          <a href="https://jobs.lever.co/acme-ai/stage-backend">Apply on Lever</a>
          <a href="/careers">Carrières</a>
          <a href="/contact">Contactez-nous</a>
        </body>
      </html>
    `,
    'https://acme-ai.example/careers': `
      <html>
        <body>
          <p>Équipe campus: <a href="mailto:recrutement@acme-ai.example">recrutement@acme-ai.example</a></p>
        </body>
      </html>
    `,
    'https://acme-ai.example/contact': `
      <html>
        <body>
          <p>Service RH: rh@acme-ai.example</p>
          <form action="/contact/submit" method="post">
            <input type="email" name="email" />
            <textarea name="message"></textarea>
          </form>
        </body>
      </html>
    `,
  };

  const mockFetch = (async (input: string | URL) => {
    const url = String(input);
    const body = pages[url];
    if (!body) return new Response('Not found', { status: 404 });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;

  const results = await discoverChannelsFromUrl(
    {
      organization: 'Acme AI',
      title: 'Stage Backend Python',
      sourceUrl: 'https://acme-ai.example/jobs/stage-backend',
    },
    {
      fetchFn: mockFetch,
      skipSecurityForTest: true,
      nowIso: '2026-11-17T10:00:00.000Z',
    }
  );

  // Never includes noreply@
  assert.equal(
    results.some((c) => c.target.includes('noreply@')),
    false
  );

  // Discovered JSON-LD recruiter contact with metadata
  const recruiter = results.find((c) => c.target === 'claire.martin@acme-ai.example');
  assert.ok(recruiter);
  assert.equal(recruiter.channelRole, 'recruiter_contact');
  assert.equal(recruiter.contactName, 'Claire Martin');
  assert.equal(recruiter.verified, true);
  assert.equal(recruiter.verificationStatus, 'verified_published');
  assert.equal(recruiter.relevance, 'high');
  assert.equal(recruiter.sourceUrl, 'https://acme-ai.example/jobs/stage-backend');
  assert.equal(recruiter.discoveredAt, '2026-11-17T10:00:00.000Z');

  // Discovered secondary /careers recruiting email
  const recruitingInbox = results.find((c) => c.target === 'recrutement@acme-ai.example');
  assert.ok(recruitingInbox);
  assert.equal(recruitingInbox.channelRole, 'recruiting_email');
  assert.equal(recruitingInbox.sourceUrl, 'https://acme-ai.example/careers');

  // Discovered secondary /contact HR email and company contact form
  const hrEmail = results.find((c) => c.target === 'rh@acme-ai.example');
  assert.ok(hrEmail);
  assert.equal(hrEmail.channelRole, 'hr_contact');
  assert.equal(hrEmail.relevance, 'high');

  const contactForm = results.find((c) => c.channelRole === 'company_contact_form');
  assert.ok(contactForm);
  assert.equal(contactForm.target, 'https://acme-ai.example/contact/submit');
  assert.equal(contactForm.verified, true);

  // Discovered Lever ATS form
  const atsForm = results.find((c) => c.target === 'https://jobs.lever.co/acme-ai/stage-backend');
  assert.ok(atsForm);
  assert.equal(atsForm.verificationStatus, 'verified_ats_form');
});

test('discoverChannelsFromUrl never fetches prohibited link_only jobboard domains', async () => {
  let fetchCalled = false;
  const mockFetch = (async () => {
    fetchCalled = true;
    return new Response('<html><body>should-not-scrape@meteojob.com</body></html>', { status: 200 });
  }) as unknown as typeof fetch;

  const results = await discoverChannelsFromUrl(
    {
      organization: 'TargetCorp',
      title: 'Stage React',
      sourceUrl: 'https://www.meteojob.com/emploi/stage-react-123',
    },
    {
      fetchFn: mockFetch,
      skipSecurityForTest: true,
    }
  );

  assert.equal(fetchCalled, false);
  assert.equal(results.length, 0);
});
