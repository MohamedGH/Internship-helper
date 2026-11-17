import {
  ApplicationChannel,
  CandidateProfile,
  ChannelType,
  CoverLetterLanguage,
  CoverLetterTone,
  InternshipOffer,
  PreparedDossier,
} from '../types/domain';
import { selectPreferredChannel } from './channelFinder';

export interface ApplicationEmailDraft {
  readonly subject: string;
  readonly recipientEmail: string | null;
  readonly body: string;
  readonly formCoverNote: string;
}

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

export const extractOfferMissions = (offer: InternshipOffer): readonly string[] => {
  const rawDesc = offer.description.trim();
  if (!rawDesc || offer.contentAccessible === false) {
    return [];
  }

  const sentences = rawDesc
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 25 && s.length <= 220);

  const missionPattern =
    /\b(développ|concev|particip|intégr|construi|optimis|deploy|build|develop|design|implement|analy|model|pipeline|api|test|automat|data|stack)\b/i;

  const prioritized = sentences.filter((s) => missionPattern.test(s));
  if (prioritized.length > 0) {
    return prioritized.slice(0, 2);
  }
  return sentences.slice(0, 2);
};

export const extractRelevantExperience = (
  profile: CandidateProfile,
  offer: InternshipOffer
): readonly string[] => {
  if (profile.experiences.length > 0) {
    const offerCorpus = `${offer.title} ${offer.description} ${offer.requirements.join(' ')}`.toLowerCase();
    const scored = [...profile.experiences].sort((a, b) => {
      const aTokens = a.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
      const bTokens = b.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
      const aScore = aTokens.filter((t) => offerCorpus.includes(t)).length;
      const bScore = bTokens.filter((t) => offerCorpus.includes(t)).length;
      return bScore - aScore;
    });
    return scored.slice(0, 2);
  }

  const cvLines = profile.rawCvText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 20 && line.length <= 180);

  return cvLines.slice(0, 2);
};

export const computeCvTailoringPoints = (
  profile: CandidateProfile,
  offer: InternshipOffer,
  language: CoverLetterLanguage
): readonly string[] => {
  const matched = extractMatchingSkills(profile, offer);
  const matchedText =
    matched.length > 0
      ? matched.join(', ')
      : offer.requirements.slice(0, 3).join(', ') || 'les compétences demandées';
  const schoolLabel = profile.school.trim() || 'votre formation';
  const degreeLabel = profile.degree.trim() || 'votre cursus';
  const availabilityLabel = profile.availability.trim() || 'à préciser';
  const relevantExp = extractRelevantExperience(profile, offer);
  const topExperience = relevantExp[0] ?? `${degreeLabel} (${schoolLabel})`;
  const secondExperience = relevantExp[1];

  const durationLabelFr = offer.duration ?? 'durée à vérifier sur l’annonce';
  const durationLabelEn = offer.duration ?? 'duration to confirm';

  if (language === 'fr') {
    const points = [
      `Mettre en avant la maîtrise de ${matchedText} en lien avec les exigences de ${offer.organization}.`,
      `Placer l'expérience "${topExperience}" en tête de la rubrique Expériences / Projets.`,
      `Indiquer votre disponibilité (${availabilityLabel}) pour le stage (${durationLabelFr}) à ${offer.location}.`,
    ];
    if (secondExperience) {
      points.push(`Relier "${secondExperience}" aux attentes techniques du poste ${offer.title}.`);
    }
    return points;
  }

  const points = [
    `Highlight proven skills in ${matchedText} matching ${offer.organization}'s requirements.`,
    `Feature "${topExperience}" at the top of your Experience & Projects section.`,
    `State your availability (${availabilityLabel}) for the ${durationLabelEn} internship in ${offer.location}.`,
  ];
  if (secondExperience) {
    points.push(`Connect "${secondExperience}" directly to the ${offer.title} scope.`);
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
    return `Candidature stage — ${offer.title} — ${candidateName}${schoolSuffix}`;
  }
  return `Internship Application: ${offer.title} — ${candidateName}${schoolSuffix}`;
};

// Generator 1: Independent Personalized Cover Letter (Lettre de motivation)
export const composeCoverLetterTemplate = (
  offer: InternshipOffer,
  profile: CandidateProfile,
  language: CoverLetterLanguage,
  tone: CoverLetterTone
): string => {
  const matched = extractMatchingSkills(profile, offer);
  const requestedTech = offer.requirements.slice(0, 5);
  const skillsText =
    matched.length > 0
      ? matched.join(', ')
      : requestedTech.length > 0
        ? requestedTech.join(', ')
        : 'développement logiciel';
  const relevantExp = extractRelevantExperience(profile, offer);
  const missions = extractOfferMissions(offer);
  const realOrgSummary = offer.organizationSummary?.trim() || null;
  const inaccessibleContent = offer.contentAccessible === false || offer.description.trim() === '';

  const candidateName = profile.fullName.trim() || '[Nom Prénom]';
  const degreeLabel = profile.degree.trim() || '[Diplôme / Formation]';
  const schoolLabel = profile.school.trim() || '[École / Université]';
  const availabilityLabel = profile.availability.trim() || '[Disponibilité à préciser]';
  const durationLabelFr = offer.duration ?? 'durée à confirmer';
  const durationLabelEn = offer.duration ?? 'duration to confirm';
  const startConstraintFr = offer.startDate
    ? `à compter du ${offer.startDate}`
    : `selon mes disponibilités (${availabilityLabel})`;
  const startConstraintEn = offer.startDate
    ? `starting ${offer.startDate}`
    : `available ${availabilityLabel}`;
  const contactLine = [profile.email.trim(), profile.phone.trim()].filter(Boolean).join(' · ');

  if (language === 'fr') {
    const opening =
      tone === 'enthusiastic'
        ? `C'est avec un réel intérêt que je vous adresse ma candidature pour le poste de ${offer.title} chez ${offer.organization} (${durationLabelFr}, ${offer.location} · ${offer.workMode}).`
        : tone === 'concise'
          ? `Étudiant(e) en ${degreeLabel} à ${schoolLabel}, je candidate au stage de ${offer.title} chez ${offer.organization} (${durationLabelFr}, ${startConstraintFr}).`
          : `Actuellement étudiant(e) en ${degreeLabel} à ${schoolLabel}, je souhaite rejoindre ${offer.organization} dans le cadre d'un stage de ${durationLabelFr} en tant que ${offer.title}, ${startConstraintFr}.`;

    const contextLines: string[] = [];
    if (realOrgSummary) {
      contextLines.push(`L'activité de ${offer.organization} (${realOrgSummary.replace(/\.$/, '')}) répond directement à mon projet professionnel.`);
    }
    if (missions.length > 0) {
      contextLines.push(
        `Les missions décrites dans votre annonce — notamment « ${missions[0]} » — correspondent à mon parcours technique${requestedTech.length > 0 ? ` autour de ${requestedTech.join(', ')}` : ''}.`
      );
    } else if (inaccessibleContent) {
      contextLines.push(
        `[Remarque : le texte complet de l'annonce sur ${offer.source} n'était pas accessible automatiquement ; vérifier les missions exactes sur l'offre originale avant envoi.]`
      );
    } else if (requestedTech.length > 0) {
      contextLines.push(
        `Les technologies demandées pour ce stage (${requestedTech.join(', ')}) rejoignent directement mon socle technique.`
      );
    }

    const expBlock =
      relevantExp.length > 0
        ? `Lors de mes réalisations (${relevantExp.join(' ; ')}), j'ai mis en pratique ${skillsText} avec une attention particulière portée à la qualité du code, aux tests et au travail en équipe.`
        : `Au cours de ma formation en ${degreeLabel} à ${schoolLabel}, j'ai consolidé mes bases en ${skillsText} à travers des projets concrets et collaboratifs.`;

    const linksLine =
      profile.portfolioUrl || profile.linkedinUrl
        ? `Mon CV ainsi que mon portfolio (${profile.portfolioUrl || profile.linkedinUrl}) sont joints pour détailler mes réalisations.`
        : `Vous trouverez ci-joint mon CV détaillant mon parcours et mes projets techniques.`;

    return [
      `Madame, Monsieur,`,
      ``,
      opening,
      ``,
      ...(contextLines.length > 0 ? [contextLines.join(' '), ``] : []),
      expBlock,
      ``,
      `${linksLine} Disponible ${availabilityLabel} sur ${offer.location}, je serais ravi(e) d'échanger avec vous lors d'un entretien.`,
      ``,
      `Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.`,
      candidateName,
      ...(contactLine ? [contactLine] : []),
    ].join('\n');
  }

  const openingEn =
    tone === 'enthusiastic'
      ? `I am eager to apply for the ${offer.title} internship at ${offer.organization} (${durationLabelEn}, ${offer.location} · ${offer.workMode}, ${startConstraintEn}).`
      : tone === 'concise'
        ? `As a ${degreeLabel} student at ${schoolLabel}, I am applying for the ${offer.title} internship at ${offer.organization} (${durationLabelEn}, ${startConstraintEn}).`
        : `As a ${degreeLabel} student at ${schoolLabel}, I am writing to apply for the ${offer.title} internship at ${offer.organization} (${durationLabelEn}, ${startConstraintEn}).`;

  const contextLinesEn: string[] = [];
  if (realOrgSummary) {
    contextLinesEn.push(`${offer.organization}'s work (${realOrgSummary.replace(/\.$/, '')}) aligns closely with my engineering focus.`);
  }
  if (missions.length > 0) {
    contextLinesEn.push(
      `The role responsibilities outlined in your posting — in particular "${missions[0]}" — match my hands-on background${requestedTech.length > 0 ? ` in ${requestedTech.join(', ')}` : ''}.`
    );
  } else if (inaccessibleContent) {
    contextLinesEn.push(
      `[Note: full listing text on ${offer.source} was not automatically accessible; please review the original posting before submitting.]`
    );
  } else if (requestedTech.length > 0) {
    contextLinesEn.push(
      `The technical stack requested (${requestedTech.join(', ')}) aligns directly with my core capabilities.`
    );
  }

  const expBlockEn =
    relevantExp.length > 0
      ? `In my recent experience (${relevantExp.join('; ')}), I applied ${skillsText} to deliver tested, maintainable software while collaborating closely with team members.`
      : `Through my ${degreeLabel} coursework at ${schoolLabel}, I have built strong foundations in ${skillsText} through hands-on engineering projects.`;

  const linksLineEn =
    profile.portfolioUrl || profile.linkedinUrl
      ? `My CV and portfolio (${profile.portfolioUrl || profile.linkedinUrl}) are attached for your review.`
      : `My CV is attached for your review.`;

  return [
    `Dear Hiring Team at ${offer.organization},`,
    ``,
    openingEn,
    ``,
    ...(contextLinesEn.length > 0 ? [contextLinesEn.join(' '), ``] : []),
    expBlockEn,
    ``,
    `${linksLineEn} I am available ${availabilityLabel} in ${offer.location} and would welcome the chance to discuss how I can contribute to your team.`,
    ``,
    `Sincerely,`,
    candidateName,
    ...(contactLine ? [contactLine] : []),
  ].join('\n');
};

// Generator 2: Independent Application Email & Form Cover Note
export const composeApplicationEmail = (
  offer: InternshipOffer,
  profile: CandidateProfile,
  language: CoverLetterLanguage,
  tone: CoverLetterTone,
  selectedChannel?: ApplicationChannel
): ApplicationEmailDraft => {
  const subject = composeEmailSubject(offer, profile, language);
  const recipientEmail =
    selectedChannel?.type === ChannelType.Email && selectedChannel.verified
      ? selectedChannel.target
      : null;

  const candidateName = profile.fullName.trim() || '[Nom Prénom]';
  const degreeLabel = profile.degree.trim() || 'étudiant(e) en informatique';
  const schoolLabel = profile.school.trim();
  const educationShort = schoolLabel ? `${degreeLabel} à ${schoolLabel}` : degreeLabel;
  const matched = extractMatchingSkills(profile, offer).slice(0, 3);
  const matchedText = matched.length > 0 ? matched.join(', ') : offer.requirements.slice(0, 3).join(', ');
  const topExp = extractRelevantExperience(profile, offer)[0];
  const availabilityLabel = profile.availability.trim() || 'à convenir';
  const durationLabelFr = offer.duration ?? 'à préciser';
  const durationLabelEn = offer.duration ?? 'to confirm';
  const contactFooter = [
    profile.email.trim(),
    profile.phone.trim(),
    profile.portfolioUrl.trim() || profile.linkedinUrl.trim(),
  ]
    .filter(Boolean)
    .join(' | ');

  const greetingName = selectedChannel?.contactName?.trim();

  if (language === 'fr') {
    const salutation = greetingName ? `Bonjour ${greetingName},` : `Bonjour,`;
    const intro =
      tone === 'concise'
        ? `Actuellement en ${educationShort}, je vous transmets ma candidature pour le stage de ${offer.title} au sein de ${offer.organization}.`
        : `Actuellement en ${educationShort}, je me permets de vous adresser ma candidature pour le poste de ${offer.title} chez ${offer.organization}.`;

    const motivation = topExp
      ? `Mon expérience récente (« ${topExp} »)${matchedText ? ` ainsi que mes compétences en ${matchedText}` : ''} correspondent directement aux besoins de votre équipe.`
      : `Mes compétences en ${matchedText || 'développement logiciel'} et mes projets techniques rejoignent les attentes de cette mission.`;

    const logistics = `Je suis disponible ${availabilityLabel} pour une durée de ${durationLabelFr}${offer.startDate ? ` (début souhaité autour du ${offer.startDate})` : ''}, à ${offer.location}.`;

    const attachments = `Vous trouverez en pièces jointes mon CV ainsi que ma lettre de motivation détaillée.`;

    const body = [
      salutation,
      ``,
      intro,
      ``,
      `${motivation} ${logistics}`,
      ``,
      attachments,
      ``,
      `Bien cordialement,`,
      candidateName,
      ...(contactFooter ? [contactFooter] : []),
    ].join('\n');

    const formCoverNote = [
      `Bonjour,`,
      ``,
      `Étudiant(e) en ${educationShort}, je candidate au stage de ${offer.title} chez ${offer.organization} (${durationLabelFr}, disponible ${availabilityLabel}).`,
      topExp
        ? `Mon parcours (${topExp}) et mes compétences en ${matchedText || 'ingénierie logicielle'} me permettent d'être rapidement opérationnel(le).`
        : `Mes compétences en ${matchedText || 'ingénierie logicielle'} me permettent de contribuer dès le début du stage.`,
      `Mon CV et ma lettre de motivation sont joints à ce formulaire.`,
      ``,
      `Cordialement, ${candidateName}`,
    ].join('\n');

    return { subject, recipientEmail, body, formCoverNote };
  }

  const salutationEn = greetingName ? `Hello ${greetingName},` : `Hello,`;
  const introEn =
    tone === 'concise'
      ? `I am a ${degreeLabel}${schoolLabel ? ` student at ${schoolLabel}` : ''} applying for the ${offer.title} internship at ${offer.organization}.`
      : `I am currently studying ${degreeLabel}${schoolLabel ? ` at ${schoolLabel}` : ''} and would like to apply for the ${offer.title} internship at ${offer.organization}.`;

  const motivationEn = topExp
    ? `My recent project experience ("${topExp}")${matchedText ? ` and skills in ${matchedText}` : ''} align closely with this role.`
    : `My technical background in ${matchedText || 'software engineering'} aligns closely with this internship.`;

  const logisticsEn = `I am available ${availabilityLabel} for ${durationLabelEn}${offer.startDate ? ` (target start: ${offer.startDate})` : ''} in ${offer.location}.`;

  const attachmentsEn = `Please find my CV and tailored cover letter attached for your review.`;

  const bodyEn = [
    salutationEn,
    ``,
    introEn,
    ``,
    `${motivationEn} ${logisticsEn}`,
    ``,
    attachmentsEn,
    ``,
    `Best regards,`,
    candidateName,
    ...(contactFooter ? [contactFooter] : []),
  ].join('\n');

  const formCoverNoteEn = [
    `Hello,`,
    ``,
    `I am a ${degreeLabel}${schoolLabel ? ` student at ${schoolLabel}` : ''} applying for ${offer.title} at ${offer.organization} (${durationLabelEn}, available ${availabilityLabel}).`,
    topExp
      ? `With experience such as "${topExp}" and skills in ${matchedText || 'software engineering'}, I am ready to contribute quickly.`
      : `With strong skills in ${matchedText || 'software engineering'}, I am ready to contribute quickly.`,
    `My CV and cover letter are attached in this application.`,
    ``,
    `Best regards, ${candidateName}`,
  ].join('\n');

  return { subject, recipientEmail, body: bodyEn, formCoverNote: formCoverNoteEn };
};

export const buildPreparedDossier = (
  offer: InternshipOffer,
  profile: CandidateProfile,
  language: CoverLetterLanguage = 'fr',
  tone: CoverLetterTone = 'professional'
): PreparedDossier => {
  const preferredChannel = selectPreferredChannel(offer.channels);
  const emailDraft = composeApplicationEmail(offer, profile, language, tone, preferredChannel);

  return {
    offerId: offer.id,
    language,
    tone,
    emailSubject: emailDraft.subject,
    emailBody: emailDraft.body,
    formCoverNote: emailDraft.formCoverNote,
    recipientEmail: emailDraft.recipientEmail,
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
