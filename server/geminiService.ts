import { GoogleGenAI, Type } from '@google/genai';

export interface SearchRequestPayload {
  keywords: string;
  location: string;
  duration: string;
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

  const prompt = [
    `Find real, current internship / stage opportunities matching:`,
    `- Role / Keywords: ${query.keywords}`,
    `- Location: ${query.location || 'France / Remote'}`,
    `- Duration: ${query.duration || '6 months'}`,
    `- Work mode preference: ${query.workMode || 'all'}`,
    `- Target sources to search across: ${sourcesList}`,
    ``,
    `Return ONLY a valid JSON array (no markdown commentary outside JSON) of 5 to 7 distinct internship offers.`,
    `Each item must have keys:`,
    `"title", "organization", "organizationSummary", "location", "workMode" ("On-site" | "Hybrid" | "Remote"), "duration", "source" (one of ${sourcesList}), "sourceUrl" (real URL from search), "postedDate" (YYYY-MM-DD), "description" (concise 2-sentence summary), "requirements" (array of 3-5 key skills), "applicationEmail" (direct recruiting/campus email if found, else empty string), "applicationFormUrl" (official career or ATS application URL if found), "contactName" (optional recruiter or team name).`,
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
    organizationSummary: string;
    location: string;
    duration: string;
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
  coverLetter: string;
  cvTailoringHighlights: string[];
}> => {
  const ai = createGeminiClient();
  const langLabel = input.language === 'fr' ? 'French (Lettre de motivation)' : 'English';

  const prompt = [
    `Prepare a tailored internship application dossier in ${langLabel} with a ${input.tone} tone.`,
    ``,
    `OFFER & ORGANIZATION:`,
    `- Role: ${input.offer.title}`,
    `- Organization: ${input.offer.organization}`,
    `- Summary: ${input.offer.organizationSummary}`,
    `- Location & Duration: ${input.offer.location}, ${input.offer.duration}`,
    `- Description: ${input.offer.description}`,
    `- Requirements: ${input.offer.requirements.join(', ')}`,
    ``,
    `CANDIDATE PROFILE & CV:`,
    `- Name: ${input.profile.fullName}`,
    `- Contact: ${input.profile.email} | ${input.profile.phone}`,
    `- School & Degree: ${input.profile.degree} at ${input.profile.school}`,
    `- Availability: ${input.profile.availability}`,
    `- Portfolio: ${input.profile.portfolioUrl}`,
    `- Skills: ${input.profile.skills.join(', ')}`,
    `- Key Experiences: ${input.profile.experiences.join(' | ')}`,
    `- CV Notes: ${input.profile.rawCvText.slice(0, 1200)}`,
    ``,
    `Instructions:`,
    `- Write an authentic, specific cover letter (220-300 words) connecting the candidate's actual skills and projects directly to ${input.offer.organization} and ${input.offer.title}.`,
    `- Write a concise, clear email subject line.`,
    `- Provide 3-4 actionable CV tailoring bullet points showing exactly what to emphasize on the CV for this specific offer.`,
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
        required: ['emailSubject', 'coverLetter', 'cvTailoringHighlights'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    emailSubject?: string;
    coverLetter?: string;
    cvTailoringHighlights?: string[];
  };

  return {
    emailSubject: parsed.emailSubject ?? `Candidature ${input.offer.title} — ${input.profile.fullName}`,
    coverLetter: parsed.coverLetter ?? '',
    cvTailoringHighlights: Array.isArray(parsed.cvTailoringHighlights)
      ? parsed.cvTailoringHighlights
      : [],
  };
};
