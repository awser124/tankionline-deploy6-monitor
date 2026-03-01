const { execSync } = require('child_process');
const fs = require('fs');
const nodemailer = require('nodemailer');
const Diff = require('diff');

const LAST_VERSION_FILE = 'last_version.txt';
const OLD_JS_FILE = 'old_main.js';
const NEW_JS_FILE = 'new_main.js';

const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * 提取特定关键词的变更片段
 */
function getTargetedDiff(oldContent, newContent) {
    const keywords = [/Tsunami/i, /tsunami/i, /spectator/i, /vlog/i, /TsunamiTurret/i];
    // 使用 diffLines 进行逐行对比
    const diffs = Diff.diffLines(oldContent, newContent);
    let result = "";

    diffs.forEach((part) => {
        if ((part.added || part.removed) && keywords.some(regex => regex.test(part.value))) {
            const prefix = part.added ? '[ADDED] ' : '[REMOVED] ';
            result += `\n${prefix}----------------------\n${part.value.trim()}\n`;
        }
    });

    return result;
}

async function sendAlert(subject, text) {
    const mailOptions = {
        from: `"Monitor System" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        subject: subject,
        text: text
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`[Notification] 邮件已发送`);
    } catch (error) {
        console.error(`[Error] 邮件发送失败: ${error.message}`);
    }
}

function fetchWithRetry(url, fileName) {
    try {
        execSync(`curl -sL --connect-timeout 20 -A "Mozilla/5.0" "${url}" > ${fileName}`);
        return true;
    } catch (e) {
        return false;
    }
}

async function checkUpdate() {
    console.log(`--- [${new Date().toLocaleTimeString()}] 正在同步远程代码状态 ---`);
    try {
        const indexUrl = "https://public-deploy6.test-eu.tankionline.com/browser-public/index.html";
        if (!fetchWithRetry(indexUrl, 'index.html')) return;
        
        const indexContent = fs.readFileSync('index.html', 'utf8');
        const match = indexContent.match(/main\.(.*)\.js/);
        
        if (match) {
            const latestJs = match[0];
            const lastVersion = fs.existsSync(LAST_VERSION_FILE) ? fs.readFileSync(LAST_VERSION_FILE, 'utf8').trim() : '';

            if (latestJs !== lastVersion) {
                console.log(`[Update] 检测到新版本: ${latestJs}`);
                const jsUrl = `https://public-deploy6.test-eu.tankionline.com/browser-public/static/js/${latestJs}`;
                
                if (fetchWithRetry(jsUrl, NEW_JS_FILE)) {
                    let diffReport = "初始运行，无对比基准。";
                    
                    if (fs.existsSync(OLD_JS_FILE)) {
                        const oldContent = fs.readFileSync(OLD_JS_FILE, 'utf8');
                        const newContent = fs.readFileSync(NEW_JS_FILE, 'utf8');
                        diffReport = getTargetedDiff(oldContent, newContent) || "代码哈希变更，但指定关键词逻辑未发生变动。";
                    }

                    const alertMsg = `版本变动: ${latestJs}\n\n代码逻辑 Diff 分析:\n${diffReport}\n\n地址: ${jsUrl}`;
                    await sendAlert(`代码版本更新报告: ${latestJs}`, alertMsg);

                    // 同步文件用于下次对比
                    fs.copyFileSync(NEW_JS_FILE, OLD_JS_FILE);
                    fs.writeFileSync(LAST_VERSION_FILE, latestJs);
                    
                    // 将变更同步至仓库，确保跨工作流持久化
                    try {
                        execSync('git config --global user.name "Version-Bot"');
                        execSync('git config --global user.email "bot@version.com"');
                        execSync('git add last_version.txt old_main.js');
                        execSync('git commit -m "Update JS baseline"');
                        execSync('git push');
                        console.log("[Git] 基准线已更新至仓库。");
                    } catch (e) {
                        console.log("[Git] 无需提交或同步失败。");
                    }
                }
            } else {
                console.log(`[Info] 当前版本 ${latestJs} 已是最新。`);
            }
        }
    } catch (err) {
        console.error(`[Fatal] 运行异常: ${err.message}`);
    }
}

setInterval(checkUpdate, 120000);
checkUpdate();
