const { execSync } = require('child_process');
const fs = require('fs');
const nodemailer = require('nodemailer');
const Diff = require('diff'); // 需要 npm install diff

const LOCK_FILE = 'monitor.lock';
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
 * 提取包含关键指纹的 Diff 片段
 * 避免全量发送混淆后的几万行代码
 */
function getTargetedDiff(oldContent, newContent) {
    const keywords = [/Tsunami/i, /tsunami/i, /spectator/i, /vlog/i, /TsunamiTurret/i];
    const diffs = Diff.diffLines(oldContent, newContent);
    let result = "";

    diffs.forEach((part) => {
        // 仅记录增加或删除的部分，且包含关键词
        if ((part.added || part.removed) && keywords.some(regex => regex.test(part.value))) {
            const prefix = part.added ? '[新增] ' : '[移除] ';
            result += `\n${prefix}----------------------\n${part.value.trim()}\n`;
        }
    });

    return result || "未发现核心指纹变动，仅为常规逻辑优化。";
}

async function sendAlert(subject, text) {
    const mailOptions = {
        from: `"3D坦克测试服监测" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        subject: subject,
        text: text
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`[数据已发送]`);
    } catch (error) {
        console.error(`[推送失败]: ${error.message}`);
    }
}

function fetchWithRetry(url, fileName) {
    try {
        execSync(`curl -sL --connect-timeout 20 -A "Mozilla/5.0" "${url}" > ${fileName}`);
        return true;
    } catch (e) {
        console.log(`抓取失败，跳过本次轮询。`);
        return false;
    }
}

async function checkUpdate() {
    console.log(`--- [${new Date().toLocaleTimeString()}] 正在扫描测试服底层逻辑 ---`);
    try {
        const indexUrl = "https://public-deploy6.test-eu.tankionline.com/browser-public/index.html";
        if (!fetchWithRetry(indexUrl, 'index.html')) return;
        
        const indexContent = fs.readFileSync('index.html', 'utf8');
        const match = indexContent.match(/main\.(.*)\.js/);
        
        if (match) {
            const latestJs = match[0];
            const lastVersion = fs.existsSync(LAST_VERSION_FILE) ? fs.readFileSync(LAST_VERSION_FILE, 'utf8') : '';

            if (latestJs !== lastVersion) {
                console.log(`【警报】发现新版本: ${latestJs}`);
                const jsUrl = `https://public-deploy6.test-eu.tankionline.com/browser-public/static/js/${latestJs}`;
                
                if (fetchWithRetry(jsUrl, NEW_JS_FILE)) {
                    let diffReport = "暂无旧版本对比数据。";
                    
                    if (fs.existsSync(OLD_JS_FILE)) {
                        const oldContent = fs.readFileSync(OLD_JS_FILE, 'utf8');
                        const newContent = fs.readFileSync(NEW_JS_FILE, 'utf8');
                        diffReport = getTargetedDiff(oldContent, newContent);
                    }

                    const alertMsg = `版本号变动: ${latestJs}\n\n核心逻辑 Diff 分析:\n${diffReport}\n\n抓取地址: ${jsUrl}`;
                    await sendAlert(`【】Tsunami/权限 逻辑变动报告`, alertMsg);

                    // 更新持久化数据
                    fs.copyFileSync(NEW_JS_FILE, OLD_JS_FILE);
                    fs.writeFileSync(LAST_VERSION_FILE, latestJs);
                }
            } else {
                console.log(`状态稳定：${latestJs}`);
            }
        }
    } catch (err) {
        console.error(`错误: ${err.message}`);
    }
}

setInterval(checkUpdate, 120000);
checkUpdate();
