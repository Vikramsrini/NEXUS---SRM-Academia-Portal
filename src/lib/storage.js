export function getStudentData() {
  try {
    return JSON.parse(localStorage.getItem('academia_student') || '{}');
  } catch {
    return {};
  }
}

export function getToken() {
  return localStorage.getItem('academia_token') || '';
}

export function updateStoredStudentData(data) {
  try {
    localStorage.setItem('academia_student', JSON.stringify(data));
  } catch {
    // Storage full or other error
  }
}
