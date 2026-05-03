#!/usr/bin/env node
/**
 * setup.js - MyTeamBrain installation and management script
 * Provides install, verify, uninstall, and rollback functionality
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const HOME = process.env.HOME || require('os').homedir();
const CONFIG_DIR = path.join(HOME, '.myteambrain');
const KNOWLEDGE_DIR = path.join(CONFIG_DIR, 'knowledge');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const HOOKS_DIR = path.join(__dirname, '..', '.claude', 'hooks');
const SETTINGS_FILE = path.join(__dirname, '..', '.claude', 'settings.local.json');

const MIN_NODE_VERSION = 18;

const DEFAULT_CONFIG = {
  sessionStart: {
    enabled: true,
    knowledgeDir: "~/.myteambrain/knowledge",
    topK: 5,
    scorer: "bm25",
    injectVia: "env",
    injectFile: "/tmp/myteambrain-inject.json",
    minScore: 0.1
  },
  stopHook: {
    enabled: true,
    extractKeywords: true,
    minImportance: 2
  },
  gitSync: {
    autoPush: true,
    autoPull: true,
    remotes: ["gitee", "github"]
  }
};

const ROLLBACK_STATE_FILE = path.join(CONFIG_DIR, '.rollback-state.json');

// ─── Utility Functions ───────────────────────────────────────────────────────

function log(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${level}] ${timestamp}: ${message}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log('info', `Created: ${dir}`);
  }
}

function fileExists(file) {
  return fs.existsSync(file);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Dependency Checks ───────────────────────────────────────────────────────

function checkNodeVersion() {
  const version = process.version.slice(1);
  const [major] = version.split('.').map(Number);
  if (major < MIN_NODE_VERSION) {
    throw new Error(`Node.js ${MIN_NODE_VERSION}+ required, got ${process.version}`);
  }
  log('info', `Node.js version: ${process.version} ✓`);
  return true;
}

function checkGit() {
  try {
    const version = execSync('git --version', { encoding: 'utf8' }).trim();
    log('info', `Git: ${version} ✓`);
    return true;
  } catch {
    throw new Error('git not found - please install git');
  }
}

function checkClaudeCLI() {
  const paths = [
    '/Users/m1/.nvm/versions/node/v22.21.1/bin/claude',
    path.join(HOME, '.nvm', 'versions/node/v22.21.1/bin', 'claude'),
    execSync('which claude', { encoding: 'utf8' }).trim()
  ].filter(Boolean);

  for (const claudePath of paths) {
    try {
      const version = execSync(`"${claudePath}" --version`, { encoding: 'utf8' }).trim();
      log('info', `Claude CLI: ${version} at ${claudePath} ✓`);
      return claudePath;
    } catch {
      // Try next path
    }
  }
  throw new Error('claude CLI not found');
}

// ─── Configuration ───────────────────────────────────────────────────────────

function loadConfig() {
  if (fileExists(CONFIG_FILE)) {
    return readJson(CONFIG_FILE);
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  ensureDir(CONFIG_DIR);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  log('info', `Config saved: ${CONFIG_FILE}`);
}

function loadSettings() {
  if (fileExists(SETTINGS_FILE)) {
    return readJson(SETTINGS_FILE);
  }
  return { permissions: { allow: [] } };
}

function saveSettings(settings) {
  const dir = path.dirname(SETTINGS_FILE);
  ensureDir(dir);
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  log('info', `Settings saved: ${SETTINGS_FILE}`);
}

// ─── Hook Registration ───────────────────────────────────────────────────────

function registerHooks(claudePath) {
  const settings = loadSettings();

  if (!settings.permissions) settings.permissions = {};
  if (!settings.permissions.allow) settings.permissions.allow = [];

  const hookPermissions = [
    'Bash(claude hooks *)',
    'Bash(node *)'
  ];

  for (const perm of hookPermissions) {
    if (!settings.permissions.allow.includes(perm)) {
      settings.permissions.allow.push(perm);
    }
  }

  settings.hooks = settings.hooks || {};
  settings.hooks.SessionStart = {
    command: 'node',
    args: ['{CLAUDE_CWD}/.claude/hooks/session-start-hook.js'],
    enabled: true
  };

  settings.hooks.Stop = {
    command: 'node',
    args: ['{CLAUDE_CWD}/.claude/hooks/stop-hook.js'],
    enabled: true
  };

  saveSettings(settings);
  log('info', 'Hooks registered in settings.local.json');
}

function unregisterHooks() {
  const settings = loadSettings();

  if (settings.hooks) {
    delete settings.hooks.SessionStart;
    delete settings.hooks.Stop;
  }

  saveSettings(settings);
  log('info', 'Hooks unregistered from settings.local.json');
}

// ─── Memory Directory Setup ───────────────────────────────────────────────────

function setupMemoryDirectory() {
  ensureDir(CONFIG_DIR);
  ensureDir(KNOWLEDGE_DIR);
  ensureDir(path.join(KNOWLEDGE_DIR, 'daily'));
  ensureDir(path.join(KNOWLEDGE_DIR, 'sessions'));
  log('info', `Memory directory structure created at ${KNOWLEDGE_DIR}`);

  const gitDir = path.join(KNOWLEDGE_DIR, '.git');
  if (!fileExists(gitDir)) {
    try {
      execSync('git init', { cwd: KNOWLEDGE_DIR, stdio: 'ignore' });
      execSync('git config user.email "myteambrain@local" && git config user.name "MyTeamBrain"', {
        cwd: KNOWLEDGE_DIR,
        stdio: 'ignore'
      });
      log('info', 'Git repository initialized for knowledge base');
    } catch (e) {
      log('warn', 'Could not initialize git repo in knowledge directory');
    }
  }
}

// ─── Rollback Support ────────────────────────────────────────────────────────

function saveRollbackState(state) {
  fs.writeFileSync(ROLLBACK_STATE_FILE, JSON.stringify(state, null, 2));
}

function loadRollbackState() {
  if (fileExists(ROLLBACK_STATE_FILE)) {
    return readJson(ROLLBACK_STATE_FILE);
  }
  return null;
}

function clearRollbackState() {
  if (fileExists(ROLLBACK_STATE_FILE)) {
    fs.unlinkSync(ROLLBACK_STATE_FILE);
  }
}

function captureState() {
  return {
    configExists: fileExists(CONFIG_FILE),
    settingsExists: fileExists(SETTINGS_FILE),
    knowledgeDirExists: fileExists(KNOWLEDGE_DIR),
    settingsContent: fileExists(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, 'utf8') : null,
    configContent: fileExists(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, 'utf8') : null
  };
}

// ─── Main Functions ──────────────────────────────────────────────────────────

const setup = {
  /**
   * Main installation function
   */
  install() {
    log('info', '=== MyTeamBrain Installation ===');

    const rollbackState = captureState();
    saveRollbackState(rollbackState);

    try {
      checkNodeVersion();
      checkGit();
      const claudePath = checkClaudeCLI();

      const config = loadConfig();
      saveConfig(config);
      log('info', 'Configuration file created ✓');

      setupMemoryDirectory();
      log('info', 'Memory directory structure initialized ✓');

      registerHooks(claudePath);
      log('info', 'Claude Code hooks registered ✓');

      this.verify();

      clearRollbackState();

      log('info', '=== Installation Complete ===');
      console.log(`
MyTeamBrain has been installed successfully!

Knowledge directory: ${KNOWLEDGE_DIR}
Config file: ${CONFIG_FILE}

Next steps:
  - Restart Claude Code to activate hooks
  - Run 'myteambrain --help' for CLI commands
  - Customize settings in ${CONFIG_FILE}
`);
      return true;
    } catch (error) {
      log('error', `Installation failed: ${error.message}`);
      this.rollback();
      throw error;
    }
  },

  /**
   * Verify installation
   */
  verify() {
    log('info', '=== Verifying Installation ===');
    const errors = [];
    const warnings = [];

    try {
      checkNodeVersion();
    } catch (e) {
      errors.push(`Node.js: ${e.message}`);
    }

    try {
      checkGit();
    } catch (e) {
      errors.push(`git: ${e.message}`);
    }

    try {
      checkClaudeCLI();
    } catch (e) {
      errors.push(`claude CLI: ${e.message}`);
    }

    if (fileExists(CONFIG_FILE)) {
      log('info', 'Config file exists ✓');
    } else {
      errors.push('Config file not found');
    }

    const settings = loadSettings();
    if (settings.hooks && settings.hooks.SessionStart && settings.hooks.Stop) {
      log('info', 'Hooks registered ✓');
    } else {
      errors.push('Hooks not registered');
    }

    if (fileExists(KNOWLEDGE_DIR)) {
      log('info', `Memory directory exists: ${KNOWLEDGE_DIR} ✓`);
    } else {
      warnings.push('Memory directory not found (will be created on first use)');
    }

    try {
      const testFile = path.join(KNOWLEDGE_DIR, '.test');
      const testContent = `Test at ${new Date().toISOString()}`;
      fs.writeFileSync(testFile, testContent);
      const read = fs.readFileSync(testFile, 'utf8');
      fs.unlinkSync(testFile);
      if (read === testContent) {
        log('info', 'Memory write/read test passed ✓');
      } else {
        errors.push('Memory test failed - read mismatch');
      }
    } catch (e) {
      warnings.push(`Memory test skipped: ${e.message}`);
    }

    console.log('\n--- Verification Results ---');
    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(e => console.log(`  ✗ ${e}`));
    }
    if (warnings.length > 0) {
      console.log('\nWarnings:');
      warnings.forEach(w => console.log(`  ! ${w}`));
    }
    if (errors.length === 0) {
      console.log('\n✓ All checks passed!');
      return true;
    } else {
      console.log('\n✗ Verification failed');
      return false;
    }
  },

  /**
   * Uninstall MyTeamBrain
   */
  uninstall(keepMemory = true) {
    log('info', '=== MyTeamBrain Uninstallation ===');

    try {
      unregisterHooks();
      log('info', 'Hooks unregistered ✓');

      if (fileExists(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
        log('info', 'Config file removed ✓');
      }

      if (fileExists(KNOWLEDGE_DIR)) {
        if (keepMemory) {
          console.log(`
Memory directory preserved at: ${KNOWLEDGE_DIR}
To remove manually: rm -rf ${KNOWLEDGE_DIR}
`);
        } else {
          fs.rmSync(KNOWLEDGE_DIR, { recursive: true, force: true });
          log('info', 'Memory directory removed ✓');
        }
      }

      clearRollbackState();

      log('info', '=== Uninstallation Complete ===');
      console.log('\nMyTeamBrain has been uninstalled. Restart Claude Code to complete cleanup.');
      return true;
    } catch (error) {
      log('error', `Uninstallation failed: ${error.message}`);
      throw error;
    }
  },

  /**
   * Rollback to previous state
   */
  rollback() {
    log('info', '=== Rolling Back Installation ===');

    const state = loadRollbackState();
    if (!state) {
      log('warn', 'No rollback state found, nothing to rollback');
      return false;
    }

    try {
      if (state.settingsContent !== null) {
        const dir = path.dirname(SETTINGS_FILE);
        ensureDir(dir);
        fs.writeFileSync(SETTINGS_FILE, state.settingsContent);
        log('info', 'Settings restored ✓');
      }

      if (state.configContent !== null) {
        ensureDir(CONFIG_DIR);
        fs.writeFileSync(CONFIG_FILE, state.configContent);
        log('info', 'Config restored ✓');
      }

      if (!state.configExists && fileExists(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
      }
      if (!state.settingsExists && fileExists(SETTINGS_FILE)) {
        fs.unlinkSync(SETTINGS_FILE);
      }

      if (!state.knowledgeDirExists && fileExists(KNOWLEDGE_DIR)) {
        fs.rmSync(KNOWLEDGE_DIR, { recursive: true, force: true });
        log('info', 'Knowledge directory removed ✓');
      }

      clearRollbackState();
      log('info', '=== Rollback Complete ===');
      console.log('\nInstallation has been rolled back to the previous state.');
      return true;
    } catch (error) {
      log('error', `Rollback failed: ${error.message}`);
      console.error('Critical error during rollback - manual intervention may be required');
      return false;
    }
  }
};

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'install';

  switch (command) {
    case 'install':
      setup.install();
      break;
    case 'verify':
      setup.verify();
      break;
    case 'uninstall':
      const keepMemory = !args.includes('--remove-memory');
      setup.uninstall(keepMemory);
      break;
    case 'rollback':
      setup.rollback();
      break;
    case '--help':
    case '-h':
      console.log(`
MyTeamBrain Setup Script

Usage:
  node setup.js [command] [options]

Commands:
  install     Install MyTeamBrain (default)
  verify      Verify installation
  uninstall   Uninstall MyTeamBrain
  rollback    Rollback last installation

Options:
  --remove-memory    (with uninstall) Also remove knowledge directory

Examples:
  node setup.js install
  node setup.js verify
  node setup.js uninstall --remove-memory
  node setup.js rollback
`);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "node setup.js --help" for usage information');
      process.exit(1);
  }
}

module.exports = setup;

if (require.main === module) {
  main();
}