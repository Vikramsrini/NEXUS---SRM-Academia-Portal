import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchPlacementBatches,
  fetchPlacementCompanies,
  fetchPlacementCompanyDetails,
  fetchPlacementResources,
} from '../lib/api';
import './SubPages.css';
import './PlacementPage.css';

const Icons = {
  briefcase: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  refresh: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
    </svg>
  ),
  external: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  ),
  sheet: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  ),
  book: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  ),
  sparkles: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
    </svg>
  ),
  calendar: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  close: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

const BATCHES = [
  { id: '26', label: 'Batch 2027', badge: 'Upcoming' },
  { id: '25', label: 'Batch 2026', badge: 'Active' },
  { id: '24', label: 'Batch 2025', badge: 'Archive' },
  { id: '23', label: 'Batch 2024', badge: 'Archive' },
];

function getCategoryColorClass(cat = '') {
  const c = cat.toLowerCase();
  if (c.includes('super dream') || c.includes('marquee')) return 'badge-super-dream';
  if (c.includes('dream')) return 'badge-dream';
  if (c.includes('core')) return 'badge-core';
  if (c.includes('day 1') || c.includes('day 2') || c.includes('day1')) return 'badge-day1';
  return 'badge-standard';
}

function parseCtcValue(ctcStr = '') {
  if (!ctcStr) return 0;
  const match = ctcStr.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

export default function PlacementPage() {
  const [selectedBatch, setSelectedBatch] = useState('25'); // Batch 2026 default
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'ctc_desc' | 'name'

  // Modal / Expanded Details
  const [activeCompanyDetails, setActiveCompanyDetails] = useState(null);
  const [loadingDetailsId, setLoadingDetailsId] = useState(null);
  const [detailsCache, setDetailsCache] = useState({});

  // Resources Modal
  const [showResources, setShowResources] = useState(false);
  const [resources, setResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);

  const studentData = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('academia_student') || '{}');
    } catch {
      return {};
    }
  }, []);

  const regNumber = studentData.registrationNumber || '';

  // Load Companies
  const loadBatchCompanies = useCallback(async (yearId, force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetchPlacementCompanies(yearId, force, regNumber);
      if (res && Array.isArray(res.companies)) {
        setCompanies(res.companies);
      }
    } catch (err) {
      console.error('Failed loading placement companies:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [regNumber]);

  useEffect(() => {
    loadBatchCompanies(selectedBatch);
  }, [selectedBatch, loadBatchCompanies]);

  // Load Resources
  const handleOpenResources = async () => {
    setShowResources(true);
    if (resources.length === 0) {
      setLoadingResources(true);
      try {
        const res = await fetchPlacementResources(false, regNumber);
        if (res?.resources) setResources(res.resources);
      } catch (err) {
        console.error('Failed loading resources:', err);
      } finally {
        setLoadingResources(false);
      }
    }
  };

  // Open SQM / Company Details
  const handleViewCompanyDetails = async (company) => {
    const cid = company.companyId;
    if (detailsCache[cid]) {
      setActiveCompanyDetails({ company, ...detailsCache[cid] });
      return;
    }

    setLoadingDetailsId(cid);
    try {
      const data = await fetchPlacementCompanyDetails(cid, regNumber);
      setDetailsCache((prev) => ({ ...prev, [cid]: data }));
      setActiveCompanyDetails({ company, ...data });
    } catch (err) {
      console.error('Failed to load company details:', err);
      setActiveCompanyDetails({
        company,
        sqmLink: null,
        feedbackLink: null,
        links: [],
      });
    } finally {
      setLoadingDetailsId(null);
    }
  };

  // Extract categories for filter
  const availableCategories = useMemo(() => {
    const cats = new Set();
    companies.forEach((c) => {
      if (c.category) cats.add(c.category.trim());
    });
    return Array.from(cats);
  }, [companies]);

  // Statistics
  const stats = useMemo(() => {
    const total = companies.length;
    let maxCtc = 0;
    let superDreamCount = 0;
    let dreamCount = 0;

    companies.forEach((c) => {
      const val = parseCtcValue(c.ctc);
      if (val > maxCtc) maxCtc = val;
      const cat = (c.category || '').toLowerCase();
      if (cat.includes('super dream') || cat.includes('marquee')) superDreamCount++;
      else if (cat.includes('dream')) dreamCount++;
    });

    return { total, maxCtc, superDreamCount, dreamCount };
  }, [companies]);

  // Filter & Sort
  const filteredCompanies = useMemo(() => {
    let result = [...companies];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.role?.toLowerCase().includes(q) ||
          c.category?.toLowerCase().includes(q) ||
          c.ctc?.toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'all') {
      result = result.filter((c) => c.category?.trim() === selectedCategory);
    }

    if (sortBy === 'ctc_desc') {
      result.sort((a, b) => parseCtcValue(b.ctc) - parseCtcValue(a.ctc));
    } else if (sortBy === 'name') {
      result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    return result;
  }, [companies, searchQuery, selectedCategory, sortBy]);

  return (
    <div className="apple-page-container placement-page-apple">
      {/* ── Header ── */}
      <div className="subpage-header">
        <div className="subpage-title-group">
          <div className="placement-header-badge">
            <span className="live-dot" /> Live Portal Data
          </div>
          <h1 className="subpage-title">Placement Insights</h1>
          <p className="subpage-desc">
            Direct from SRM CDC Portal · CTCs, Roles, Eligibility & Stagewise Question Matrices (SQM)
          </p>
        </div>

        <div className="placement-header-actions">
          <button
            className="apple-btn placement-action-btn secondary"
            onClick={handleOpenResources}
          >
            {Icons.book}
            <span>Prep Materials & Resumes</span>
          </button>

          <button
            className={`apple-btn placement-action-btn primary ${refreshing ? 'spinning' : ''}`}
            onClick={() => loadBatchCompanies(selectedBatch, true)}
            disabled={refreshing || loading}
          >
            {Icons.refresh}
            <span>{refreshing ? 'Refreshing...' : 'Sync Portal'}</span>
          </button>
        </div>
      </div>

      {/* ── Quick Stats ── */}
      <div className="placement-stats-grid">
        <div className="placement-stat-card">
          <span className="stat-label">Companies Visiting</span>
          <span className="stat-value">{loading ? '—' : stats.total}</span>
          <span className="stat-hint">{BATCHES.find((b) => b.id === selectedBatch)?.label} Drive</span>
        </div>

        <div className="placement-stat-card highlight">
          <span className="stat-label">Highest Package</span>
          <span className="stat-value">{loading ? '—' : stats.maxCtc ? `${stats.maxCtc} LPA` : 'N/A'}</span>
          <span className="stat-hint">Dream & Marquee Offers</span>
        </div>

        <div className="placement-stat-card">
          <span className="stat-label">Super Dream / Marquee</span>
          <span className="stat-value">{loading ? '—' : stats.superDreamCount}</span>
          <span className="stat-hint">≥ 10 LPA CTC Tiers</span>
        </div>

        <div className="placement-stat-card">
          <span className="stat-label">Dream Companies</span>
          <span className="stat-value">{loading ? '—' : stats.dreamCount}</span>
          <span className="stat-hint">5 – 10 LPA CTC Tiers</span>
        </div>
      </div>

      {/* ── Batch Selector Tabs ── */}
      <div className="placement-batch-bar">
        <div className="batch-segmented-control">
          {BATCHES.map((b) => (
            <button
              key={b.id}
              className={`batch-tab-btn ${selectedBatch === b.id ? 'active' : ''}`}
              onClick={() => setSelectedBatch(b.id)}
            >
              <span>{b.label}</span>
              {b.badge && <span className={`tab-badge ${b.badge.toLowerCase()}`}>{b.badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="placement-filter-bar">
        <div className="placement-search-wrapper">
          {Icons.search}
          <input
            type="text"
            className="placement-search-input"
            placeholder="Search companies (e.g. Google, Amazon, Accenture, GET)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
              {Icons.close}
            </button>
          )}
        </div>

        <div className="placement-filter-dropdowns">
          <select
            className="placement-select"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">All Categories ({companies.length})</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            className="placement-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="date">Sort: Drive Date</option>
            <option value="ctc_desc">Sort: Highest CTC</option>
            <option value="name">Sort: Company (A-Z)</option>
          </select>
        </div>
      </div>

      {/* ── Companies List ── */}
      {loading ? (
        <div className="placement-loading-state">
          <div className="loading-spinner" />
          <p>Fetching placement insights from Student Portal...</p>
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="placement-empty-state">
          <p className="empty-title">No companies found</p>
          <p className="empty-desc">
            {searchQuery
              ? `No results matching "${searchQuery}". Try a different keyword.`
              : 'No placement records currently available for this batch.'}
          </p>
          {searchQuery && (
            <button className="apple-btn secondary" onClick={() => setSearchQuery('')}>
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className="placement-company-grid stagger-children">
          {filteredCompanies.map((company, idx) => {
            const isLoadingDetails = loadingDetailsId === company.companyId;

            return (
              <div key={company.companyId || idx} className="placement-company-card">
                <div className="card-top-row">
                  <div className="company-identity">
                    <div className="company-avatar">
                      {company.name?.charAt(0).toUpperCase() || 'C'}
                    </div>
                    <div>
                      <h3 className="company-name">{company.name}</h3>
                      <div className="company-visit-date">
                        {Icons.calendar}
                        <span>{company.dateOfVisit || 'Date TBA'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="company-ctc-pill">
                    <span className="ctc-val">{company.ctc || 'CTC TBA'}</span>
                  </div>
                </div>

                <div className="card-role-section">
                  <span className="role-label">Role:</span>
                  <p className="role-text">{company.role || 'Not Specified'}</p>
                </div>

                <div className="card-meta-row">
                  <span className={`category-tag ${getCategoryColorClass(company.category)}`}>
                    {company.category || 'General'}
                  </span>
                  {company.eligibility && (
                    <span className="eligibility-tag">
                      Eligibility: {company.eligibility}
                    </span>
                  )}
                </div>

                <div className="card-action-row">
                  <button
                    className="view-sqm-btn"
                    onClick={() => handleViewCompanyDetails(company)}
                    disabled={isLoadingDetails}
                  >
                    {isLoadingDetails ? (
                      <>
                        <span className="mini-spinner" />
                        <span>Loading Prep...</span>
                      </>
                    ) : (
                      <>
                        {Icons.sheet}
                        <span>View SQM & Interview Prep</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SQM & Company Details Modal ── */}
      {activeCompanyDetails && (
        <div className="apple-modal-overlay" onClick={() => setActiveCompanyDetails(null)}>
          <div className="apple-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="apple-modal-header">
              <div className="modal-title-group">
                <span className="modal-super-title">Interview Preparation & Matrices</span>
                <h2 className="modal-title">{activeCompanyDetails.company.name}</h2>
                <div className="modal-tags">
                  <span className="modal-tag ctc">{activeCompanyDetails.company.ctc}</span>
                  <span className={`modal-tag ${getCategoryColorClass(activeCompanyDetails.company.category)}`}>
                    {activeCompanyDetails.company.category}
                  </span>
                </div>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setActiveCompanyDetails(null)}
              >
                {Icons.close}
              </button>
            </div>

            <div className="apple-modal-body">
              <div className="modal-company-info">
                <div className="info-item">
                  <span className="info-k">Job Role</span>
                  <span className="info-v">{activeCompanyDetails.company.role || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="info-k">Drive Date</span>
                  <span className="info-v">{activeCompanyDetails.company.dateOfVisit || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="info-k">Cutoff Eligibility</span>
                  <span className="info-v">{activeCompanyDetails.company.eligibility || '—'}</span>
                </div>
              </div>

              <div className="modal-links-section">
                <h4 className="links-section-heading">Official CDC Resources & Sheets</h4>

                {(!activeCompanyDetails.sqmLink &&
                  !activeCompanyDetails.feedbackLink &&
                  (!activeCompanyDetails.links || activeCompanyDetails.links.length === 0)) ? (
                  <div className="no-matrix-state">
                    <p>No SQM or candidate feedback sheets have been uploaded for this company yet by the placement office.</p>
                  </div>
                ) : (
                  <div className="matrix-links-list">
                    {activeCompanyDetails.sqmLink && (
                      <a
                        href={activeCompanyDetails.sqmLink}
                        target="_blank"
                        rel="noreferrer"
                        className="matrix-link-card primary-link"
                      >
                        <div className="link-icon-box">{Icons.sheet}</div>
                        <div className="link-info">
                          <span className="link-title">Stagewise Question Matrix (SQM)</span>
                          <span className="link-desc">Past rounds, coding questions, and evaluation stages</span>
                        </div>
                        <span className="open-link-pill">
                          Open Sheet {Icons.external}
                        </span>
                      </a>
                    )}

                    {activeCompanyDetails.feedbackLink && (
                      <a
                        href={activeCompanyDetails.feedbackLink}
                        target="_blank"
                        rel="noreferrer"
                        className="matrix-link-card feedback-link"
                      >
                        <div className="link-icon-box">{Icons.sparkles}</div>
                        <div className="link-info">
                          <span className="link-title">Candidate Interview Feedback</span>
                          <span className="link-desc">Experiences, tips, and insights from selected seniors</span>
                        </div>
                        <span className="open-link-pill">
                          View Feedback {Icons.external}
                        </span>
                      </a>
                    )}

                    {activeCompanyDetails.links
                      ?.filter(
                        (l) =>
                          l.url !== activeCompanyDetails.sqmLink &&
                          l.url !== activeCompanyDetails.feedbackLink
                      )
                      .map((l, i) => (
                        <a
                          key={i}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                          className="matrix-link-card"
                        >
                          <div className="link-icon-box">{Icons.sheet}</div>
                          <div className="link-info">
                            <span className="link-title">{l.title}</span>
                            <span className="link-desc">Additional placement reference material</span>
                          </div>
                          <span className="open-link-pill">
                            Open {Icons.external}
                          </span>
                        </a>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Learning Resources Modal ── */}
      {showResources && (
        <div className="apple-modal-overlay" onClick={() => setShowResources(false)}>
          <div className="apple-modal-card resources-modal" onClick={(e) => e.stopPropagation()}>
            <div className="apple-modal-header">
              <div className="modal-title-group">
                <span className="modal-super-title">SRM Placement Portal</span>
                <h2 className="modal-title">Prep Materials & Resumes</h2>
                <p className="modal-subtext">
                  Official repository of case studies, aptitude drives, and placed students' resumes.
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setShowResources(false)}>
                {Icons.close}
              </button>
            </div>

            <div className="apple-modal-body">
              {loadingResources ? (
                <div className="placement-loading-state">
                  <div className="loading-spinner" />
                  <p>Loading CDC preparation materials...</p>
                </div>
              ) : (
                <div className="resources-grid-list">
                  {resources.map((item, idx) => (
                    <a
                      key={idx}
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="resource-item-card"
                    >
                      <div className="resource-icon-circle">
                        {item.title.toLowerCase().includes('resume') ? Icons.briefcase : Icons.book}
                      </div>
                      <div className="resource-text-box">
                        <span className="resource-item-title">{item.title}</span>
                        <span className="resource-item-action">
                          Open in Google Drive {Icons.external}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
