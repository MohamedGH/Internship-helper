import React, { useState } from 'react';
import { Check, RotateCcw, Save, User } from 'lucide-react';
import { CandidateProfile, ErrorSeverity } from '../types/domain';
import { useAppState } from '../managers/AppStateContext';
import { EMPTY_CANDIDATE_PROFILE } from '../managers/stateManager';
import { createAppError } from '../managers/errorManager';

export const CvProfileView: React.FC = () => {
  const { state, updateProfile, reportError } = useAppState();
  const [draft, setDraft] = useState<CandidateProfile>(state.profile);
  const [skillsText, setSkillsText] = useState(state.profile.skills.join(', '));
  const [experiencesText, setExperiencesText] = useState(state.profile.experiences.join('\n'));
  const [savedNotice, setSavedNotice] = useState(false);
  const [imgError, setImgError] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.fullName.trim() || !draft.email.includes('@')) {
      reportError(
        createAppError({
          code: 'INVALID_PROFILE',
          severity: ErrorSeverity.Validation,
          message: 'Full name and a valid email address are required for your CV profile.',
          context: 'profile',
        })
      );
      return;
    }

    const parsedSkills = skillsText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const parsedExperiences = experiencesText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    updateProfile({
      ...draft,
      skills: parsedSkills,
      experiences: parsedExperiences,
    });

    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleResetProfile = () => {
    setDraft(EMPTY_CANDIDATE_PROFILE);
    setSkillsText('');
    setExperiencesText('');
    updateProfile(EMPTY_CANDIDATE_PROFILE);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-6 pb-24 md:pb-12">
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {!imgError && draft.avatarUrl ? (
            <img
              src={draft.avatarUrl}
              alt={`${draft.fullName} profile portrait`}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
              <User className="w-7 h-7 text-slate-500" aria-hidden="true" />
            </div>
          )}

          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Candidate CV &amp; Profile
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              Powers multi-platform internship search queries and adapts every cover letter to your CV.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetProfile}
          className="min-h-[40px] px-3.5 py-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg self-start sm:self-center whitespace-nowrap"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          Clear Profile
        </button>
      </section>

      <form
        onSubmit={handleSave}
        className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cv-fullname" className="block text-xs font-medium text-slate-700 mb-1">
              Full Name
            </label>
            <input
              id="cv-fullname"
              type="text"
              placeholder="Your full name"
              value={draft.fullName}
              onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
              className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
            />
          </div>

          <div>
            <label htmlFor="cv-email" className="block text-xs font-medium text-slate-700 mb-1">
              Email Address
            </label>
            <input
              id="cv-email"
              type="email"
              placeholder="you@university.edu"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
            />
          </div>

          <div>
            <label htmlFor="cv-phone" className="block text-xs font-medium text-slate-700 mb-1">
              Phone
            </label>
            <input
              id="cv-phone"
              type="text"
              placeholder="+33 6 ..."
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
            />
          </div>

          <div>
            <label htmlFor="cv-location" className="block text-xs font-medium text-slate-700 mb-1">
              Location / Priority City
            </label>
            <input
              id="cv-location"
              type="text"
              placeholder="e.g. Lille, Paris, Lyon"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
            />
          </div>

          <div>
            <label htmlFor="cv-school" className="block text-xs font-medium text-slate-700 mb-1">
              School / University
            </label>
            <input
              id="cv-school"
              type="text"
              placeholder="Engineering school or university"
              value={draft.school}
              onChange={(e) => setDraft({ ...draft, school: e.target.value })}
              className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
            />
          </div>

          <div>
            <label htmlFor="cv-degree" className="block text-xs font-medium text-slate-700 mb-1">
              Degree &amp; Program
            </label>
            <input
              id="cv-degree"
              type="text"
              placeholder="e.g. MSc Software Engineering"
              value={draft.degree}
              onChange={(e) => setDraft({ ...draft, degree: e.target.value })}
              className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
            />
          </div>

          <div>
            <label
              htmlFor="cv-availability"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Internship Availability &amp; Duration
            </label>
            <input
              id="cv-availability"
              type="text"
              placeholder="e.g. February 2027 — 6 months"
              value={draft.availability}
              onChange={(e) => setDraft({ ...draft, availability: e.target.value })}
              className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
            />
          </div>

          <div>
            <label htmlFor="cv-portfolio" className="block text-xs font-medium text-slate-700 mb-1">
              Portfolio / GitHub URL
            </label>
            <input
              id="cv-portfolio"
              type="url"
              placeholder="https://github.com/username"
              value={draft.portfolioUrl}
              onChange={(e) => setDraft({ ...draft, portfolioUrl: e.target.value })}
              className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
            />
          </div>

          <div>
            <label htmlFor="cv-target" className="block text-xs font-medium text-slate-700 mb-1">
              Target Stage / Internship Role
            </label>
            <input
              id="cv-target"
              type="text"
              placeholder="e.g. Full-Stack / Data / AI Intern"
              value={draft.targetRole}
              onChange={(e) => setDraft({ ...draft, targetRole: e.target.value })}
              className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cv-skills" className="block text-xs font-medium text-slate-700 mb-1">
            Skills (comma-separated)
          </label>
          <input
            id="cv-skills"
            type="text"
            placeholder="TypeScript, React, Python, SQL..."
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
          />
        </div>

        <div>
          <label
            htmlFor="cv-experiences"
            className="block text-xs font-medium text-slate-700 mb-1"
          >
            Key Experiences &amp; Projects (one per line)
          </label>
          <textarea
            id="cv-experiences"
            rows={4}
            placeholder="Describe your projects or previous internships (one per line)"
            value={experiencesText}
            onChange={(e) => setExperiencesText(e.target.value)}
            className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
          />
        </div>

        <div>
          <label htmlFor="cv-raw" className="block text-xs font-medium text-slate-700 mb-1">
            Full CV Text (pasted resume content used for deeper adaptation)
          </label>
          <textarea
            id="cv-raw"
            rows={6}
            placeholder="Paste your CV text here..."
            value={draft.rawCvText}
            onChange={(e) => setDraft({ ...draft, rawCvText: e.target.value })}
            className="w-full p-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700"
          />
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
          {savedNotice ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Check className="w-4 h-4" aria-hidden="true" />
              CV Profile saved
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              Saved locally and used for all future cover letter adaptations.
            </span>
          )}

          <button
            type="submit"
            className="min-h-[44px] px-5 py-2.5 inline-flex items-center gap-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            Save CV Profile
          </button>
        </div>
      </form>
    </main>
  );
};
