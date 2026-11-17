import { GoogleGenAI, Type } from '@google/genai';

export interface SearchRequestPayload {
  keywords: string;
  location: string;
  duration?: string;
  minDurationMonths?: number;
  maxDurationMonths?: number;
  startDateFrom?: string;
  startDateTo?: string;
  workMode: string;
  sources: string[];
}

export interface DiscoveredOfferPayload {
  title: string;
  organization: string;
  organizationSummary: string;
  location: string;
  workMode: string;
  duration: string;
  durationMonths?: number;
  startDate?: string;
  endDate?: string;
  source: string;
  sourceUrl: string;
  postedDate: string;
  description: string;
  requirements: string[];
  applicationEmail?: string;
  applicationFormUrl?: string;
  contactName?: string;
}

export interface DiscoveredChannelPayload {
  type: 'email' | 'form' | 'portal';
  target: string;
  label: string;
  contactName?: string;
  verified: boolean;
  sourceUrl?: string;
}

const createGeminiClient = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing in environment configuration.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

const extractJsonFromText = <T>(rawText: string, fallback: T): T => {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : trimmed;
  const firstBracket = candidate.indexOf('[');
  const firstBrace = candidate.indexOf('{');

  let jsonSlice = candidate;
  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    const lastBracket = candidate.lastIndexOf(']');
    if (lastBracket > firstBracket) {
      jsonSlice = candidate.slice(firstBracket, lastBracket + 1);
    }
  } else if (firstBrace !== -1) {
    const lastBrace = candidate.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      jsonSlice = candidate.slice(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(jsonSlice) as T;
  } catch {
    return fallback;
  }
};

const extractGroundingUrls = (response: unknown): Array<{ title: string; url: string }> => {
  const r = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
      };
    }>;
  };
  const chunks = r.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const urls: Array<{ title: string; url: string }> = [];
  for (const chunk of chunks) {
    if (chunk.web?.uri) {
      urls.push({
        title: chunk.web.title || chunk.web.uri,
        url: chunk.web.uri,
      });
    }
  }
  return urls.filter(
    (item, index, arr) => arr.findIndex((other) => other.url === item.url) === index
  );
};

export const searchInternshipsWithGemini = async (
  query: SearchRequestPayload
): Promise<{
  offers: DiscoveredOfferPayload[];
  groundingUrls: Array<{ title: string; url: string }>;
}> => {
  const ai = createGeminiClient();
  const sourcesList = query.sources.join(', ');

  const durationDesc =
    query.minDurationMonths && query.maxDurationMonths
      ? `${query.minDurationMonths} to ${query.maxDurationMonths} months`
      : query.duration || '6 months';
  const dateRangeDesc =
    query.startDateFrom || query.startDateTo
      ? `Starting between ${query.startDateFrom || 'anytime'} and ${query.startDateTo || 'anytime'}`
      : 'Starting upcoming semester / anytime';

  const prompt = [
    `Find real, current internship / stage opportunities matching:`,
    `- Role / Keywords: ${query.keywords}`,
    `- Location: ${query.location || 'France / Remote'}`,
    `- Duration range: ${durationDesc}`,
    `- Date range / Start period: ${dateRangeDesc}`,
    `- Work mode preference: ${query.workMode || 'all'}`,
    `- Target sources to search across: ${sourcesList}`,
    ``,
    `Return ONLY a valid JSON array (no markdown commentary outside JSON) of 5 to 7 distinct internship offers.`,
    `Each item must have keys:`,
    `"title", "organization", "organizationSummary", "location", "workMode" ("On-site" | "Hybrid" | "Remote"), "duration" (e.g. "6 months" or "4 à 6 mois"), "durationMonths" (number of months, integer), "startDate" (estimated start date YYYY-MM-DD or start month), "endDate" (estimated end date YYYY-MM-DD or end month), "source" (one of ${sourcesList}), "sourceUrl" (real URL from search), "postedDate" (YYYY-MM-DD), "description" (concise 2-sentence summary), "requirements" (array of 3-5 key skills), "applicationEmail" (direct recruiting/campus email if found, else empty string), "applicationFormUrl" (official career or ATS application URL if found), "contactName" (optional recruiter or team name).`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction:
        'You are an internship discovery researcher. Return strictly verified offers found via search with accurate company names, source URLs, and application channels. Output valid JSON array only.',
    },
  });

  const parsed = extractJsonFromText<DiscoveredOfferPayload[]>(response.text ?? '[]', []);
  const groundingUrls = extractGroundingUrls(response);

  return {
    offers: Array.isArray(parsed) ? parsed : [],
    groundingUrls,
  };
};

export const discoverChannelsWithGemini = async (input: {
  organization: string;
  title: string;
  location: string;
  sourceUrl: string;
}): Promise<DiscoveredChannelPayload[]> => {
  const ai = createGeminiClient();

  const prompt = [
    `Find the exact places to apply (where to postuler) for this internship:`,
    `Organization: ${input.organization}`,
    `Role: ${input.title}`,
    `Location: ${input.location}`,
    `Reference URL: ${input.sourceUrl}`,
    ``,
    `Search for:`,
    `1. Official career portal / ATS application form URL (Lever, Greenhouse, Ashby, Workday, WelcomeKit, Teamtailor, Taleez, or company careers page).`,
    `2. Any public university/campus recruiting, stage, or HR email address for ${input.organization} (only include real addresses found on official domains).`,
    ``,
    `Return ONLY a JSON array of channel objects with keys: "type" ("email" | "form" | "portal"), "target" (the email address or https URL), "label" (short descriptive channel name), "contactName" (optional), "verified" (boolean), "sourceUrl" (where found).`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }, { urlContext: {} }],
      systemInstruction:
        'Find real application forms and recruiting email contacts. Never invent fake personal email addresses; only return verified official recruiting emails or real career form URLs. Output valid JSON array only.',
    },
  });

  const parsed = extractJsonFromText<DiscoveredChannelPayload[]>(response.text ?? '[]', []);
  return Array.isArray(parsed) ? parsed : [];
};

export const prepareDossierWithGemini = async (input: {
  offer: {
    title: string;
    organization: string;
    organizationSummary: string | null;
    location: string;
    duration: string | null;
    description: string;
    requirements: string[];
  };
  profile: {
    fullName: string;
    email: string;
    phone: string;
    school: string;
    degree: string;
    availability: string;
    portfolioUrl: string;
    skills: string[];
    experiences: string[];
    rawCvText: string;
  };
  language: 'fr' | 'en';
  tone: 'professional' | 'enthusiastic' | 'concise';
}): Promise<{
  emailSubject: string;
  emailBody: string;
  formCoverNote: string;
  coverLetter: string;
  cvTailoringHighlights: string[];
}> => {
  const ai = createGeminiClient();
  const langLabel = input.language === 'fr' ? 'French (Lettre de motivation)' : 'English';

  const prompt = [
    `Prepare two distinct internship application documents in ${langLabel} with a ${input.tone} tone.`,
    ``,
    `OFFER & ORGANIZATION:`,
    `- Role: ${input.offer.title}`,
    `- Organization: ${input.offer.organization}`,
    ...(input.offer.organizationSummary
      ? [`- Organization Context (verified): ${input.offer.organizationSummary}`]
      : [`- Organization Context: Not provided in listing (DO NOT invent or guess company activity).`]),
    `- Location & Duration: ${input.offer.location ?? 'Unspecified'}, ${input.offer.duration ?? 'Unspecified'}`,
    `- Description: ${input.offer.description || 'Not available'}`,
    `- Requirements: ${(input.offer.requirements ?? []).join(', ')}`,
    ``,
    `CANDIDATE PROFILE & CV:`,
    `- Name: ${input.profile.fullName ?? ''}`,
    `- Contact: ${input.profile.email ?? ''} | ${input.profile.phone ?? ''}`,
    `- School & Degree: ${input.profile.degree ?? ''} at ${input.profile.school ?? ''}`,
    `- Availability: ${input.profile.availability ?? ''}`,
    `- Portfolio: ${input.profile.portfolioUrl ?? ''}`,
    `- Skills: ${(input.profile.skills ?? []).join(', ')}`,
    `- Key Experiences: ${(input.offer && input.profile.experiences ? input.profile.experiences : []).join(' | ')}`,
    `- CV Notes: ${(input.profile.rawCvText ?? '').slice(0, 1200)}`,
    ``,
    `STRICT RULES:`,
    `1. Do NOT invent any company mission, product details, or candidate experience not present above.`,
    `2. "coverLetter": Write an authentic, structured cover letter (220-280 words) grounded strictly in the real CV experiences/skills and the real offer missions/technologies.`,
    `3. "emailBody": Write a separate, concise application email (80-130 words) with brief intro, motivation, availability, mention of attached CV & cover letter, and sign-off.`,
    `4. "formCoverNote": Write a short companion note (60-90 words) ready to paste into an ATS application form message box.`,
    `5. "emailSubject": Concise, professional email subject line.`,
    `6. "cvTailoringHighlights": 3-4 actionable CV bullets referencing actual CV skills & experiences.`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          emailSubject: {
            type: Type.STRING,
            description: 'Concise email subject line for sending the application.',
          },
          emailBody: {
            type: Type.STRING,
            description: 'Concise application email distinct from the full cover letter.',
          },
          formCoverNote: {
            type: Type.STRING,
            description: 'Short companion message for web application forms.',
          },
          coverLetter: {
            type: Type.STRING,
            description: 'Complete tailored cover letter / lettre de motivation.',
          },
          cvTailoringHighlights: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '3-4 specific bullet points on how to tailor the CV for this offer.',
          },
        },
        required: ['emailSubject', 'emailBody', 'formCoverNote', 'coverLetter', 'cvTailoringHighlights'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    emailSubject?: string;
    emailBody?: string;
    formCoverNote?: string;
    coverLetter?: string;
    cvTailoringHighlights?: string[];
  };

  return {
    emailSubject: parsed.emailSubject ?? `Candidature ${input.offer.title} — ${input.profile.fullName}`,
    emailBody: parsed.emailBody ?? '',
    formCoverNote: parsed.formCoverNote ?? '',
    coverLetter: parsed.coverLetter ?? '',
    cvTailoringHighlights: Array.isArray(parsed.cvTailoringHighlights)
      ? parsed.cvTailoringHighlights
      : [],
  };
};

