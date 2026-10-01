const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function (configuration) {
  const filePath = configuration.path;
  const signtool = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\signtool.exe';
  const certPath = path.resolve(__dirname, '..', 'certs', 'LiveChatPro.pfx');

  // Retry loop with delay to handle antivirus/system file locks
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      execFileSync(signtool, [
        'sign',
        '/f', certPath,
        '/p', 'LiveChatPro2026!',
        '/fd', 'sha256',
        filePath
      ], { stdio: 'inherit' });
      console.log(`[CustomSign] Successfully signed ${filePath} on attempt ${attempt}`);
      return;
    } catch (err) {
      if (attempt === 10) {
        throw err;
      }
      console.log(`[CustomSign] File busy (${filePath}), waiting 1500ms before retry ${attempt + 1}/10...`);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
};
