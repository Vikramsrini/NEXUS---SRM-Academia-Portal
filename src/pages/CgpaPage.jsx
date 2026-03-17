import { useEffect, useMemo, useState } from 'react';
import { fetchCgpaReference, fetchCgpaState, saveCgpaState } from '../lib/api';
import './SubPages.css';

function clampGpa(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(10, numeric));
}

export default function CgpaPage() {
  const token = localStorage.getItem('academia_token') || '';
  const regNumber = (() => {
    try {
      const student = JSON.parse(localStorage.getItem('academia_student') || '{}');
      return String(student.regNumber || '').trim();
    } catch {
      return '';
    }
  })();

  const [cgpaRef, setCgpaRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState({ type: '', message: '' });
  const [saving, setSaving] = useState(false);

  const [selectedRegulation, setSelectedRegulation] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [semesterInputs, setSemesterInputs] = useState({});
  const [loadedRemoteState, setLoadedRemoteState] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await fetchCgpaReference();
        if (cancelled) return;
        setCgpaRef(data);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load CGPA reference data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  const regulationOptions = useMemo(
    () => Object.keys(cgpaRef?.regulations || {}).filter((reg) => reg !== '2018'),
    [cgpaRef]
  );
  const courseOptions = useMemo(
    () => Object.keys(cgpaRef?.regulations?.[selectedRegulation] || {}),
    [cgpaRef, selectedRegulation]
  );

  useEffect(() => {
    if (!regulationOptions.length) return;
    if (!selectedRegulation || !cgpaRef?.regulations?.[selectedRegulation]) {
      setSelectedRegulation(regulationOptions[0]);
    }
  }, [regulationOptions, selectedRegulation, cgpaRef]);

  useEffect(() => {
    if (!courseOptions.length) {
      setSelectedCourse('');
      return;
    }
    if (!selectedCourse || !cgpaRef?.regulations?.[selectedRegulation]?.[selectedCourse]) {
      setSelectedCourse(courseOptions[0]);
    }
  }, [courseOptions, selectedCourse, selectedRegulation, cgpaRef]);

  useEffect(() => {
    let cancelled = false;

    const loadSavedState = async () => {
      if (!cgpaRef || loading || loadedRemoteState || !token || !regNumber) return;

      try {
        const remote = await fetchCgpaState(regNumber, token);
        if (cancelled) return;

        if (remote?.syncEnabled === false) {
          setLoadedRemoteState(true);
          return;
        }

        if (remote?.selectedRegulation) {
          setSelectedRegulation(remote.selectedRegulation);
        }
        if (remote?.selectedCourse) {
          setSelectedCourse(remote.selectedCourse);
        }
        if (remote?.semesterInputs && typeof remote.semesterInputs === 'object') {
          setSemesterInputs(remote.semesterInputs);
        }
      } catch (e) {
        if (!cancelled) {
          setSaveState({ type: 'error', message: e.message || 'Failed to load saved CGPA state' });
        }
      } finally {
        if (!cancelled) setLoadedRemoteState(true);
      }
    };

    loadSavedState();
    return () => { cancelled = true; };
  }, [cgpaRef, loading, loadedRemoteState, regNumber, token]);

  const semesterCreditsMap = useMemo(
    () => cgpaRef?.regulations?.[selectedRegulation]?.[selectedCourse] || {},
    [cgpaRef, selectedRegulation, selectedCourse]
  );

  const semesterRows = useMemo(() => {
    return Object.entries(semesterCreditsMap)
      .map(([semester, credits]) => ({
        semester: Number(semester),
        credits: Number(credits) || 0,
      }))
      .sort((a, b) => a.semester - b.semester);
  }, [semesterCreditsMap]);

  const cgpaStats = useMemo(() => {
    let weighted = 0;
    let creditsUsed = 0;
    let enteredCount = 0;

    semesterRows.forEach((row) => {
      const gpa = clampGpa(semesterInputs[row.semester]);
      if (gpa === null) return;
      weighted += gpa * row.credits;
      creditsUsed += row.credits;
      enteredCount += 1;
    });

    const cgpa = creditsUsed > 0 ? weighted / creditsUsed : 0;

    return {
      cgpa,
      creditsUsed,
      enteredCount,
      totalSemesters: semesterRows.length,
    };
  }, [semesterRows, semesterInputs]);

  const handleSemesterChange = (semester, value) => {
    setSemesterInputs((prev) => ({ ...prev, [semester]: value }));
  };

  const clearInputs = () => {
    setSemesterInputs({});
    setSaveState({ type: '', message: '' });
  };

  const handleSave = async () => {
    if (!regNumber || !token) {
      setSaveState({ type: 'error', message: 'Login required to save CGPA state.' });
      return;
    }

    setSaving(true);
    setSaveState({ type: '', message: '' });
    try {
      const result = await saveCgpaState({
        regNumber,
        token,
        selectedRegulation,
        selectedCourse,
        semesterInputs,
      });

      if (result?.syncEnabled === false) {
        setSaveState({ type: 'error', message: result.warning || 'Cloud CGPA sync is not configured.' });
      } else {
        setSaveState({ type: 'success', message: 'CGPA state saved successfully.' });
      }
    } catch (e) {
      setSaveState({ type: 'error', message: e.message || 'Failed to save CGPA state' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="apple-page-container cgpa-page">
      <div className="subpage-header">
        <div className="subpage-title-group">
          <h1 className="subpage-title">CGPA Calculator</h1>
          <p className="subpage-desc">Credits are auto-scraped by regulation and branch. Enter only semester GPA values.</p>
        </div>
        <div className="cgpa-header-actions">
          <button className="apple-btn primary" onClick={handleSave} disabled={saving || !selectedRegulation || !selectedCourse}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="apple-btn-secondary" onClick={clearInputs}>Reset</button>
        </div>
      </div>

      {saveState.message && (
        <p className={`cgpa-state-note ${saveState.type === 'error' ? 'error' : ''}`}>{saveState.message}</p>
      )}

      <section className="cgpa-hero-card animate-fade-in-up">
        <div className="cgpa-hero-main">
          <span className="cgpa-kicker">Current CGPA</span>
          <h2>{cgpaStats.creditsUsed > 0 ? cgpaStats.cgpa.toFixed(2) : '0.00'}</h2>
          <p>Calculated with scraped semester-credit mapping from srmcgpa.netlify.app.</p>
        </div>
        <div className="cgpa-hero-grid">
          <div className="cgpa-mini-stat">
            <span>Entered Semesters</span>
            <strong>{cgpaStats.enteredCount}/{cgpaStats.totalSemesters}</strong>
          </div>
          <div className="cgpa-mini-stat">
            <span>Credits Used</span>
            <strong>{cgpaStats.creditsUsed}</strong>
          </div>
          <div className="cgpa-mini-stat">
            <span>Regulation</span>
            <strong>{selectedRegulation || '—'}</strong>
          </div>
          <div className="cgpa-mini-stat">
            <span>Branch</span>
            <strong>{selectedCourse || '—'}</strong>
          </div>
        </div>
      </section>

      <section className="cgpa-sheet animate-fade-in-up" style={{ animationDelay: '80ms' }}>
        <div className="cgpa-sheet-head">
          <h3>Auto Credit Mapping</h3>
          <p>Select regulation and branch/course, then fill semester GPA.</p>
        </div>

        {loading && <p className="cgpa-state-note">Loading scraped credit data...</p>}
        {!loading && error && <p className="cgpa-state-note error">{error}</p>}

        {!loading && !error && (
          <>
            <div className="cgpa-select-row">
              <div className="apple-input-group">
                <label>Regulation</label>
                <select value={selectedRegulation} onChange={(e) => setSelectedRegulation(e.target.value)}>
                  {regulationOptions.map((reg) => (
                    <option key={reg} value={reg}>{reg}</option>
                  ))}
                </select>
              </div>
              <div className="apple-input-group">
                <label>Branch / Course</label>
                <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)}>
                  {courseOptions.map((course) => (
                    <option key={course} value={course}>{course}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="cgpa-grid-head auto-credits">
              <span>Semester</span>
              <span>Credits (Auto)</span>
              <span>GPA</span>
            </div>

            <div className="cgpa-rows">
              {semesterRows.map((row) => (
                <div className="cgpa-row auto-credits" key={`sem-${row.semester}`}>
                  <div className="cgpa-semester-tag">Semester {row.semester}</div>
                  <div className="cgpa-credit-pill">{row.credits}</div>
                  <input
                    className="cgpa-number"
                    type="number"
                    min="0"
                    max="10"
                    step="0.01"
                    value={semesterInputs[row.semester] ?? ''}
                    onChange={(e) => handleSemesterChange(row.semester, e.target.value)}
                    placeholder="e.g. 8.75"
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
