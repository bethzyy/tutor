import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'tutor.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const SQL = await initSqlJs();

let db;
if (fs.existsSync(DB_PATH)) {
  const buf = fs.readFileSync(DB_PATH);
  db = new SQL.Database(buf);
} else {
  db = new SQL.Database();
}

// Persist helper — write queue with atomic rename for concurrency safety
let isWriting = false;
let writePending = false;

function persist() {
  if (isWriting) {
    writePending = true;
    return;
  }
  isWriting = true;
  writePending = false;

  const doWrite = () => {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      const tmpPath = DB_PATH + '.tmp';
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, DB_PATH); // atomic on most filesystems
    } catch (err) {
      console.error('Database persist failed:', err.message);
      // Retry once after 100ms
      setTimeout(() => {
        try {
          const data = db.export();
          fs.writeFileSync(DB_PATH + '.tmp', Buffer.from(data));
          fs.renameSync(DB_PATH + '.tmp', DB_PATH);
        } catch (retryErr) {
          console.error('Database persist retry also failed:', retryErr.message);
        }
      }, 100);
    }

    if (writePending) {
      writePending = false;
      // Use setImmediate to yield to the event loop before next write
      setImmediate(doWrite);
    } else {
      isWriting = false;
    }
  };

  setImmediate(doWrite);
}

function persistSync() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    console.error('Database persist failed:', err.message);
  }
}

// Auto-persist only on write operations (INSERT/UPDATE/DELETE/CREATE/DROP)
const origRun = db.run.bind(db);

db.run = function (...args) {
  const result = origRun(...args);
  persist();
  return result;
};

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    mode TEXT NOT NULL DEFAULT 'integrated',
    name TEXT DEFAULT '',
    goal TEXT DEFAULT '',
    traits TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS learning_state (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL DEFAULT 1,
    weaknesses TEXT DEFAULT '[]',
    plan TEXT DEFAULT '{}',
    current_step_id INTEGER DEFAULT 0,
    step_statuses TEXT DEFAULT '{}',
    final_exam_passed INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS conversation_history (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL DEFAULT 1,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS personality_answers (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    dimension TEXT NOT NULL,
    sub_dimension TEXT NOT NULL,
    question TEXT NOT NULL,
    user_answer TEXT NOT NULL,
    ai_analysis TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS diagnosis_history (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    mode TEXT NOT NULL,
    weaknesses TEXT NOT NULL,
    traits TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS insights (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    pattern_type TEXT NOT NULL,
    pattern_name TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence TEXT DEFAULT '[]',
    confidence REAL DEFAULT 0.5,
    occurrence_count INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'new',
    source TEXT NOT NULL DEFAULT 'rule',
    first_seen_at DATETIME DEFAULT (datetime('now')),
    last_seen_at DATETIME DEFAULT (datetime('now')),
    surfaced_at DATETIME,
    user_reaction TEXT,
    user_reflection TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS message_patterns (
    id INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL,
    insight_id INTEGER,
    pattern_type TEXT NOT NULL,
    pattern_name TEXT NOT NULL,
    snippet TEXT,
    confidence REAL DEFAULT 0.5,
    detected_by TEXT NOT NULL DEFAULT 'rule',
    created_at DATETIME DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS insight_interactions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    insight_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    reflection_text TEXT,
    created_at DATETIME DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_insights_user_status ON insights(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_message_patterns_message ON message_patterns(message_id);

  -- Assessment system tables
  CREATE TABLE IF NOT EXISTS assessment_sessions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      domain TEXT,
      battery TEXT,
      status TEXT DEFAULT 'in_progress',
      total_items INTEGER,
      answered_count INTEGER DEFAULT 0,
      self_ratings TEXT,
      started_at DATETIME DEFAULT (datetime('now')),
      completed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS assessment_responses (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      scale_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      response_text TEXT NOT NULL,
      raw_score INTEGER NOT NULL,
      actual_score REAL,
      max_score INTEGER NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES assessment_sessions(id)
  );

  CREATE TABLE IF NOT EXISTS assessment_reports (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      scale_scores TEXT NOT NULL,
      weaknesses TEXT NOT NULL,
      strengths TEXT,
      ai_recommendation TEXT,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES assessment_sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_assess_sessions_user ON assessment_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_assess_responses_session ON assessment_responses(session_id);
  CREATE INDEX IF NOT EXISTS idx_assess_reports_user ON assessment_reports(user_id);

  -- Deep assessment tables (Stage 2: AI follow-up)
  CREATE TABLE IF NOT EXISTS deep_assessment_sessions (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      assessment_session_id INTEGER NOT NULL,
      status TEXT DEFAULT 'in_progress',
      current_round INTEGER DEFAULT 0,
      total_rounds INTEGER DEFAULT 3,
      mode TEXT DEFAULT 'legacy',
      scale_summary TEXT,
      started_at DATETIME DEFAULT (datetime('now')),
      completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS deep_assessment_qa (
      id INTEGER PRIMARY KEY,
      session_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      question TEXT NOT NULL DEFAULT '',
      question_focus TEXT,
      answer TEXT,
      ai_analysis TEXT,
      role TEXT DEFAULT 'user',
      metadata TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS deep_profiles (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      core_findings TEXT NOT NULL,
      growth_barriers TEXT,
      inner_resources TEXT,
      intervention_direction TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_deep_sessions_user ON deep_assessment_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_deep_qa_session ON deep_assessment_qa(session_id);
  CREATE INDEX IF NOT EXISTS idx_deep_profiles_user ON deep_profiles(user_id);

  -- Achievements
  CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      badge_type TEXT NOT NULL,
      unlocked_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, badge_type)
  );
`);

// Migrate: add new columns to existing users table if missing
const userColumns = db.exec("PRAGMA table_info(users)");
const colNames = (userColumns[0]?.values || []).map(row => row[1]);
if (!colNames.includes('name')) db.run("ALTER TABLE users ADD COLUMN name TEXT DEFAULT ''");
if (!colNames.includes('goal')) db.run("ALTER TABLE users ADD COLUMN goal TEXT DEFAULT ''");
if (!colNames.includes('traits')) db.run("ALTER TABLE users ADD COLUMN traits TEXT DEFAULT '{}'");

// Migrate: add columns for conversational deep assessment
try {
  const sessionCols = db.exec("PRAGMA table_info(deep_assessment_sessions)");
  const sessionColNames = (sessionCols[0]?.values || []).map(row => row[1]);
  if (!sessionColNames.includes('mode')) db.run("ALTER TABLE deep_assessment_sessions ADD COLUMN mode TEXT DEFAULT 'legacy'");
} catch {}
try {
  const qaCols = db.exec("PRAGMA table_info(deep_assessment_qa)");
  const qaColNames = (qaCols[0]?.values || []).map(row => row[1]);
  if (!qaColNames.includes('role')) db.run("ALTER TABLE deep_assessment_qa ADD COLUMN role TEXT DEFAULT 'user'");
  if (!qaColNames.includes('metadata')) db.run("ALTER TABLE deep_assessment_qa ADD COLUMN metadata TEXT");
} catch {}

// Initialize default user
const userRows = db.exec('SELECT COUNT(*) as count FROM users');
const count = userRows[0]?.values[0]?.[0] || 0;
if (count === 0) {
  db.run('INSERT INTO users (id, mode) VALUES (1, ?)', ['integrated']);
  db.run('INSERT INTO learning_state (user_id) VALUES (1)');
}

// Persist initialization synchronously
persistSync();

/**
 * Helper to get a single row as object.
 * sql.js returns results as {columns, values} arrays.
 */
export function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    if (stmt.step()) {
      return stmt.getAsObject();
    }
    return null;
  } finally {
    stmt.free();
  }
}

/**
 * Helper to get all rows as objects.
 */
export function dbAll(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    return results;
  } finally {
    stmt.free();
  }
}

/**
 * Helper to run a statement and return changes info.
 */
export function dbRun(sql, params = []) {
  return db.run(sql, params);
}

export default { get: dbGet, all: dbAll, run: dbRun, persist: persistSync };
