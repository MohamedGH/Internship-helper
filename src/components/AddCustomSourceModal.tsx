import React, { useState, useEffect } from 'react';
import { Plus, X, Globe, Trash2, Check, Sparkles, ExternalLink } from 'lucide-react';
import { CustomSource } from '../types/domain';
import {
  POPULAR_SOURCE_PRESETS,
  SourcePreset,
  createCustomSource,
  formatSourceDomain,
  validateCustomSource,
} from '../modules/customSources';

interface AddCustomSourceModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly customSources: readonly CustomSource[];
  readonly onAddSource: (source: CustomSource) => void;
  readonly onRemoveSource: (sourceId: string) => void;
  readonly onToggleSource: (sourceId: string) => void;
}

export const AddCustomSourceModal: React.FC<AddCustomSourceModalProps> = ({
  isOpen,
  onClose,
  customSources,
  onAddSource,
  onRemoveSource,
  onToggleSource,
}) => {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [searchUrlTemplate, setSearchUrlTemplate] = useState('');
  const [description, setDescription] = useState('');
  const [showScraperAdvanced, setShowScraperAdvanced] = useState(false);
  const [jobListSelector, setJobListSelector] = useState('');
  const [titleSelector, setTitleSelector] = useState('');
  const [companySelector, setCompanySelector] = useState('');
  const [locationSelector, setLocationSelector] = useState('');
  const [linkSelector, setLinkSelector] = useState('');
  const [descriptionSelector, setDescriptionSelector] = useState('');
  const [collectFrequencyMinutes, setCollectFrequencyMinutes] = useState(15);
  const [usePlaywright, setUsePlaywright] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    const validation = validateCustomSource({ name, baseUrl }, customSources);
    if (!validation.valid) {
      setErrorMessage(validation.message ?? 'Please check source name and website URL.');
      return;
    }

    const hasSelectors =
      jobListSelector.trim() ||
      titleSelector.trim() ||
      companySelector.trim() ||
      locationSelector.trim() ||
      linkSelector.trim() ||
      descriptionSelector.trim();

    const newSource = createCustomSource({
      name,
      baseUrl,
      description: description.trim() || undefined,
      searchUrlTemplate: searchUrlTemplate.trim() || undefined,
      cssSelectors: hasSelectors
        ? {
            jobListSelector: jobListSelector.trim() || undefined,
            titleSelector: titleSelector.trim() || undefined,
            companySelector: companySelector.trim() || undefined,
            locationSelector: locationSelector.trim() || undefined,
            linkSelector: linkSelector.trim() || undefined,
            descriptionSelector: descriptionSelector.trim() || undefined,
          }
        : undefined,
      collectFrequencyMinutes,
      usePlaywright,
    });

    onAddSource(newSource);
    setSuccessNotice(`Custom source "${newSource.name}" added and ready for scraping.`);
    setName('');
    setBaseUrl('');
    setSearchUrlTemplate('');
    setDescription('');
    setJobListSelector('');
    setTitleSelector('');
    setCompanySelector('');
    setLocationSelector('');
    setLinkSelector('');
    setDescriptionSelector('');
    setCollectFrequencyMinutes(15);
    setUsePlaywright(false);
  };

  const handleApplyPreset = (preset: SourcePreset) => {
    setErrorMessage(null);
    setSuccessNotice(null);

    const validation = validateCustomSource({ name: preset.name, baseUrl: preset.baseUrl }, customSources);
    if (!validation.valid) {
      setErrorMessage(validation.message ?? 'This preset is already added.');
      return;
    }

    const newSource = createCustomSource({
      name: preset.name,
      baseUrl: preset.baseUrl,
      description: preset.description,
      searchUrlTemplate: preset.searchUrlTemplate,
    });

    onAddSource(newSource);
    setSuccessNotice(`Preset source "${newSource.name}" added to search.`);
  };

  const userCreatedSources = customSources.filter((s) => !s.isDefault);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-source-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
    >
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
          <div>
            <h2 id="add-source-title" className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-700" aria-hidden="true" />
              Manage &amp; Add Custom Sources
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Target specialized job boards, school intranets, or startup hubs in multi-source search
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-6">
          {/* Feedback Notices */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between"
            >
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-red-600 hover:text-red-900 ml-2"
                aria-label="Dismiss error"
              >
                &times;
              </button>
            </div>
          )}

          {successNotice && (
            <div
              role="status"
              className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                {successNotice}
              </span>
              <button
                type="button"
                onClick={() => setSuccessNotice(null)}
                className="text-emerald-700 hover:text-emerald-900 ml-2"
                aria-label="Dismiss message"
              >
                &times;
              </button>
            </div>
          )}

          {/* Quick Preset Sources Section */}
          <section aria-labelledby="presets-heading">
            <div className="flex items-center justify-between mb-2">
              <h3 id="presets-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                1-Click Popular Presets
              </h3>
              <span className="text-xs text-slate-500">French &amp; European Tech</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {POPULAR_SOURCE_PRESETS.map((preset) => {
                const isAlreadyAdded = customSources.some(
                  (s) => s.name.toLowerCase() === preset.name.toLowerCase()
                );
                return (
                  <div
                    key={preset.name}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{preset.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {formatSourceDomain(preset.baseUrl)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                        {preset.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={isAlreadyAdded}
                      onClick={() => handleApplyPreset(preset)}
                      className={`h-8 px-2.5 text-xs font-medium rounded-md inline-flex items-center justify-center gap-1 transition-colors ${
                        isAlreadyAdded
                          ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          : 'bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 hover:border-blue-300'
                      }`}
                    >
                      {isAlreadyAdded ? (
                        <>
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          Added to Sources
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          Add Preset
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Custom Source Form Section */}
          <section aria-labelledby="custom-form-heading" className="pt-2 border-t border-slate-100">
            <h3 id="custom-form-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-3">
              Add New Custom Source
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="custom-source-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Source Name *
                  </label>
                  <input
                    id="custom-source-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Station F, Meteojob, Polytech Hub"
                    className="w-full h-10 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="custom-source-url" className="block text-xs font-medium text-slate-700 mb-1">
                    Website / Portal URL *
                  </label>
                  <input
                    id="custom-source-url"
                    type="url"
                    required
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://jobs.stationf.co"
                    className="w-full h-10 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="custom-source-template" className="block text-xs font-medium text-slate-700 mb-1">
                  Optional Search URL Template
                </label>
                <input
                  id="custom-source-template"
                  type="text"
                  value={searchUrlTemplate}
                  onChange={(e) => setSearchUrlTemplate(e.target.value)}
                  placeholder="https://example.com/search?query={keywords}&city={location}"
                  className="w-full h-10 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
                />
                <span className="block text-[11px] text-slate-500 mt-1">
                  Use <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">{'{keywords}'}</code> and{' '}
                  <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">{'{location}'}</code> placeholders
                  for direct query redirection.
                </span>
              </div>

              <div>
                <label htmlFor="custom-source-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  Description / Focus (Optional)
                </label>
                <input
                  id="custom-source-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. AI & Data Science startups in Île-de-France"
                  className="w-full h-10 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-blue-700 transition-colors"
                />
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  aria-expanded={showScraperAdvanced}
                  onClick={() => setShowScraperAdvanced((prev) => !prev)}
                  className="text-xs font-medium text-blue-700 hover:text-blue-800 inline-flex items-center gap-1"
                >
                  {showScraperAdvanced
                    ? 'Hide Scraper CSS Selectors & Schedule'
                    : 'Configure CSS Selectors, Frequency & JS Fallback (Optional)'}
                </button>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Schema.org <code className="bg-slate-100 px-1 rounded">JobPosting</code> JSON-LD and Greenhouse / Lever / Ashby ATS URLs are detected automatically.
                </p>

                {showScraperAdvanced && (
                  <div className="mt-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label htmlFor="sel-job-list" className="block text-[11px] font-medium text-slate-700 mb-1">
                          Job Card Container CSS Selector
                        </label>
                        <input
                          id="sel-job-list"
                          type="text"
                          value={jobListSelector}
                          onChange={(e) => setJobListSelector(e.target.value)}
                          placeholder=".job-card or li.opening"
                          className="w-full h-9 px-2.5 text-xs font-mono text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label htmlFor="sel-title" className="block text-[11px] font-medium text-slate-700 mb-1">
                          Title CSS Selector
                        </label>
                        <input
                          id="sel-title"
                          type="text"
                          value={titleSelector}
                          onChange={(e) => setTitleSelector(e.target.value)}
                          placeholder="h3.job-title"
                          className="w-full h-9 px-2.5 text-xs font-mono text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label htmlFor="sel-company" className="block text-[11px] font-medium text-slate-700 mb-1">
                          Company Selector (Optional)
                        </label>
                        <input
                          id="sel-company"
                          type="text"
                          value={companySelector}
                          onChange={(e) => setCompanySelector(e.target.value)}
                          placeholder=".company-name"
                          className="w-full h-9 px-2.5 text-xs font-mono text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label htmlFor="sel-location" className="block text-[11px] font-medium text-slate-700 mb-1">
                          Location Selector (Optional)
                        </label>
                        <input
                          id="sel-location"
                          type="text"
                          value={locationSelector}
                          onChange={(e) => setLocationSelector(e.target.value)}
                          placeholder=".job-location"
                          className="w-full h-9 px-2.5 text-xs font-mono text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label htmlFor="sel-link" className="block text-[11px] font-medium text-slate-700 mb-1">
                          Offer Link Selector (Optional)
                        </label>
                        <input
                          id="sel-link"
                          type="text"
                          value={linkSelector}
                          onChange={(e) => setLinkSelector(e.target.value)}
                          placeholder="a.apply-link"
                          className="w-full h-9 px-2.5 text-xs font-mono text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-700"
                        />
                      </div>
                      <div>
                        <label htmlFor="sel-desc" className="block text-[11px] font-medium text-slate-700 mb-1">
                          Description Selector (Optional)
                        </label>
                        <input
                          id="sel-desc"
                          type="text"
                          value={descriptionSelector}
                          onChange={(e) => setDescriptionSelector(e.target.value)}
                          placeholder=".job-summary"
                          className="w-full h-9 px-2.5 text-xs font-mono text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:border-blue-700"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-slate-200">
                      <div className="flex items-center gap-2">
                        <label htmlFor="custom-source-freq" className="text-[11px] font-medium text-slate-700">
                          Cache TTL (minutes):
                        </label>
                        <input
                          id="custom-source-freq"
                          type="number"
                          min={0}
                          max={1440}
                          value={collectFrequencyMinutes}
                          onChange={(e) => setCollectFrequencyMinutes(Math.max(0, Number(e.target.value) || 0))}
                          className="w-20 h-8 px-2 text-xs font-mono text-slate-900 bg-white border border-slate-200 rounded-md"
                        />
                      </div>

                      <label className="inline-flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={usePlaywright}
                          onChange={(e) => setUsePlaywright(e.target.checked)}
                          className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                        />
                        <span>Enable JS rendering fallback (if available)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="h-10 px-4 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Save Custom Source
                </button>
              </div>
            </form>
          </section>

          {/* User Custom Sources List */}
          <section aria-labelledby="active-sources-heading" className="pt-2 border-t border-slate-100">
            <h3 id="active-sources-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
              Your Custom Sources ({userCreatedSources.length})
            </h3>

            {userCreatedSources.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-500">
                No custom sources added yet. Pick one of the presets above or type a new portal URL.
              </div>
            ) : (
              <ul className="space-y-2">
                {userCreatedSources.map((source) => (
                  <li
                    key={source.id}
                    className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">{source.name}</span>
                        <a
                          href={source.baseUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-blue-700 hover:underline inline-flex items-center gap-1"
                        >
                          {formatSourceDomain(source.baseUrl)}
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      </div>
                      {source.description && (
                        <p className="text-[11px] text-slate-600 mt-0.5 truncate">{source.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleSource(source.id)}
                        className={`h-7 px-2.5 rounded text-[11px] font-medium transition-colors ${
                          source.enabled
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {source.enabled ? 'Active in Search' : 'Paused'}
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveSource(source.id)}
                        aria-label={`Delete ${source.name}`}
                        className="p-1.5 text-slate-400 hover:text-red-700 rounded hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-slate-100 bg-slate-50/60">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
