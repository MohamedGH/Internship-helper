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
  const matchedText = matched.length > 0 ? matched.join(', ') : offer.requirements.slice(0, 3).join(', ') || 'les compétences techniques du poste';
  const schoolLabel = profile.school.trim() || 'votre formation';
  const degreeLabel = profile.degree.trim() || 'cursus informatique';
  const availabilityLabel = profile.availability.trim() || 'à préciser';
  const topExperience = profile.experiences[0] ?? `${degreeLabel} (${schoolLabel})`;
  const secondExperience = profile.experiences[1];

  const durationLabelFr = offer.duration ?? 'durée à préciser';
  const durationLabelEn = offer.duration ?? 'flexible-duration';

  if (language === 'fr') {
    const points = [
      `Mettre en avant la maîtrise de ${matchedText} en lien direct avec les missions de ${offer.organization}.`,
      `Positionner l'expérience "${topExperience}" en haut de la section Expériences / Projets.`,
      `Préciser la disponibilité (${availabilityLabel}) pour un stage (${durationLabelFr}) à ${offer.location}.`,
    ];
    if (secondExperience) {
      points.push(`Relier "${secondExperience}" aux enjeux produit de ${offer.title}.`);
    }
    return points;
  }

  const points = [
    `Highlight hands-on proficiency in ${matchedText} aligned with ${offer.organization}'s stack.`,
    `Feature "${topExperience}" at the top of the Experience & Projects section.`,
    `State availability (${availabilityLabel}) for the ${durationLabelEn} internship in ${offer.location}.`,
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
  const candidateName = profile.fullName.trim() || 'Candidat(e)';
  const schoolSuffix = profile.school.trim() ? ` (${profile.school.trim()})` : '';
  if (language === 'fr') {
    return `Candidature ${offer.title} — ${candidateName}${schoolSuffix}`;
  }
  return `Application: ${offer.title} — ${candidateName}${schoolSuffix}`;
};

export const composeCoverLetterTemplate = (
  offer: InternshipOffer,
  profile: CandidateProfile,
  language: CoverLetterLanguage,
  tone: CoverLetterTone
): string => {
  const matched = extractMatchingSkills(profile, offer);
  const skillsText =
    matched.length > 0
      ? matched.join(', ')
      : offer.requirements.slice(0, 4).join(', ') || 'ingénierie logicielle';
  const expSummary =
    profile.experiences.slice(0, 2).join(' ; ') ||
    `projets académiques et techniques en ${skillsText}`;
  const durationLabelFr = offer.duration ?? '6 mois';
  const durationLabelEn = offer.duration ?? 'internship';
  const candidateName = profile.fullName.trim() || '[Nom Prénom]';
  const degreeLabel = profile.degree.trim() || '[Diplôme / Formation]';
  const schoolLabel = profile.school.trim() || '[École / Université]';
  const availabilityLabel = profile.availability.trim() || '[Disponibilité]';
  const contactLine = [profile.email.trim(), profile.phone.trim()].filter(Boolean).join(' · ');

  if (language === 'fr') {
    const opening =
      tone === 'enthusiastic'
        ? `C'est avec un réel enthousiasme que je vous soumets ma candidature pour le poste de ${offer.title} au sein de ${offer.organization}.`
        : tone === 'concise'
          ? `Actuellement en ${degreeLabel} à ${schoolLabel}, je candidate au poste de ${offer.title} chez ${offer.organization} (${durationLabelFr}, disponible ${availabilityLabel}).`
          : `Actuellement étudiant(e) en ${degreeLabel} à ${schoolLabel}, je souhaite rejoindre ${offer.organization} dans le cadre d'un stage (${durationLabelFr}) en tant que ${offer.title}.`;

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
      candidateName,
      ...(contactLine ? [contactLine] : []),
    ].join('\n');
  }

  const openingEn =
    tone === 'enthusiastic'
      ? `I am excited to apply for the ${offer.title} position at ${offer.organization} for an internship (${durationLabelEn}) starting ${availabilityLabel}.`
      : tone === 'concise'
        ? `I am a ${degreeLabel} candidate at ${schoolLabel} applying for ${offer.title} at ${offer.organization} (${durationLabelEn}, available ${availabilityLabel}).`
        : `As a ${degreeLabel} student at ${schoolLabel}, I am writing to apply for the ${offer.title} internship at ${offer.organization}.`;

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
    candidateName,
    ...(contactLine ? [contactLine] : []),
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
