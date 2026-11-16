import {
  CandidateProfile,
  CoverLetterLanguage,
  CoverLetterTone,
  InternshipOffer,
  PreparedDossier,
} from '../types/domain';
import { selectPreferredChannel } from './channelFinder';

export const extractMatchingSkills = (
  profile: CandidateProfile,
  offer: InternshipOffer
): readonly string[] => {
  const offerCorpus = `${offer.title} ${offer.description} ${offer.requirements.join(' ')}`.toLowerCase();
  const matched = profile.skills.filter((skill) => {
    const token = skill.trim().toLowerCase();
    return token.length > 0 && offerCorpus.includes(token);
  });

  if (matched.length > 0) {
    return matched;
  }
  return profile.skills.slice(0, 3);
};

export const computeCvTailoringPoints = (
  profile: CandidateProfile,
  offer: InternshipOffer,
  language: CoverLetterLanguage
): readonly string[] => {
  const matched = extractMatchingSkills(profile, offer);
  const topExperience = profile.experiences[0] ?? `${profile.degree} projects at ${profile.school}`;
  const secondExperience = profile.experiences[1];

  if (language === 'fr') {
    const points = [
      `Mettre en avant la maîtrise de ${matched.join(', ')} en lien direct avec les missions de ${offer.organization}.`,
      `Positionner l'expérience "${topExperience}" en haut de la section Expériences / Projets.`,
      `Préciser la disponibilité (${profile.availability}) pour un stage de ${offer.duration} à ${offer.location}.`,
    ];
    if (secondExperience) {
      points.push(`Relier "${secondExperience}" aux enjeux produit de ${offer.title}.`);
    }
    return points;
  }

  const points = [
    `Highlight hands-on proficiency in ${matched.join(', ')} aligned with ${offer.organization}'s stack.`,
    `Feature "${topExperience}" at the top of the Experience & Projects section.`,
    `State availability (${profile.availability}) for the ${offer.duration} internship in ${offer.location}.`,
  ];
  if (secondExperience) {
    points.push(`Connect "${secondExperience}" to ${offer.title} deliverables.`);
  }
  return points;
};

export const composeEmailSubject = (
  offer: InternshipOffer,
  profile: CandidateProfile,
  language: CoverLetterLanguage
): string => {
  if (language === 'fr') {
    return `Candidature ${offer.title} — ${profile.fullName} (${profile.school})`;
  }
  return `Application: ${offer.title} — ${profile.fullName} (${profile.school})`;
};

export const composeCoverLetterTemplate = (
  offer: InternshipOffer,
  profile: CandidateProfile,
  language: CoverLetterLanguage,
  tone: CoverLetterTone
): string => {
  const matched = extractMatchingSkills(profile, offer);
  const skillsText = matched.join(', ');
  const expSummary =
    profile.experiences.slice(0, 2).join(' ; ') ||
    `projets académiques et techniques en ${skillsText}`;

  if (language === 'fr') {
    const opening =
      tone === 'enthusiastic'
        ? `C'est avec un réel enthousiasme que je vous soumets ma candidature pour le poste de ${offer.title} au sein de ${offer.organization}.`
        : tone === 'concise'
          ? `Actuellement en ${profile.degree} à ${profile.school}, je candidate au poste de ${offer.title} chez ${offer.organization} (${offer.duration}, disponible ${profile.availability}).`
          : `Actuellement étudiant(e) en ${profile.degree} à ${profile.school}, je souhaite rejoindre ${offer.organization} dans le cadre d'un stage de ${offer.duration} en tant que ${offer.title}.`;

    return [
      `Madame, Monsieur,`,
      ``,
      opening,
      ``,
      `Votre activité (${offer.organizationSummary.replace(/\.$/, '')}) et les missions de ce poste correspondent directement à mon parcours et à mes compétences clés en ${skillsText}.`,
      ``,
      `Au cours de ma formation et de mes réalisations (${expSummary}), j'ai développé une approche rigoureuse de la conception, des tests et de la livraison logicielle. Je suis convaincu(e) de pouvoir contribuer rapidement aux objectifs de votre équipe à ${offer.location}.`,
      ``,
      `Vous trouverez mon CV ci-joint ainsi que mon portfolio (${profile.portfolioUrl || profile.linkedinUrl || 'disponible sur demande'}). Je reste à votre entière disposition pour un échange.`,
      ``,
      `Bien cordialement,`,
      `${profile.fullName}`,
      `${profile.email} · ${profile.phone}`,
    ].join('\n');
  }

  const openingEn =
    tone === 'enthusiastic'
      ? `I am excited to apply for the ${offer.title} position at ${offer.organization} for a ${offer.duration} internship starting ${profile.availability}.`
      : tone === 'concise'
        ? `I am a ${profile.degree} candidate at ${profile.school} applying for ${offer.title} at ${offer.organization} (${offer.duration}, available ${profile.availability}).`
        : `As a ${profile.degree} student at ${profile.school}, I am writing to apply for the ${offer.title} internship at ${offer.organization}.`;

  return [
    `Dear Hiring Team at ${offer.organization},`,
    ``,
    openingEn,
    ``,
    `${offer.organizationSummary} Your mission and technical scope strongly align with my core experience in ${skillsText}.`,
    ``,
    `Through my recent projects and experience (${expSummary}), I have built reliable, tested solutions and collaborated effectively across product and engineering workflows. I would welcome the opportunity to bring this execution focus to your team in ${offer.location}.`,
    ``,
    `My CV is attached for your review${profile.portfolioUrl ? ` along with my portfolio (${profile.portfolioUrl})` : ''}. Thank you for your time and consideration.`,
    ``,
    `Best regards,`,
    `${profile.fullName}`,
    `${profile.email} · ${profile.phone}`,
  ].join('\n');
};

export const buildPreparedDossier = (
  offer: InternshipOffer,
  profile: CandidateProfile,
  language: CoverLetterLanguage = 'fr',
  tone: CoverLetterTone = 'professional'
): PreparedDossier => {
  const preferredChannel = selectPreferredChannel(offer.channels);
  return {
    offerId: offer.id,
    language,
    tone,
    emailSubject: composeEmailSubject(offer, profile, language),
    coverLetter: composeCoverLetterTemplate(offer, profile, language, tone),
    cvTailoringHighlights: computeCvTailoringPoints(profile, offer, language),
    matchedSkills: extractMatchingSkills(profile, offer),
    selectedChannelId: preferredChannel?.id ?? '',
    updatedAt: new Date().toISOString(),
    aiGenerated: false,
  };
};

export const countWordsAndChars = (
  text: string
): { readonly words: number; readonly chars: number } => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { words: 0, chars: 0 };
  }
  return {
    words: trimmed.split(/\s+/).length,
    chars: trimmed.length,
  };
};
