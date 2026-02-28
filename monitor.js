const { execSync } = require('child_process');
const fs = require('fs');
const nodemailer = require('nodemailer');

const LOCK_FILE = 'monitor.lock';
const LAST_VERSION_FILE = 'last_version.txt';
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
];

// QQ 邮箱专用 SMTP 配置
const transporter = nodemailer.createTransport({
    host: 'smtp.qq.com',
    port: 465,
    secure: true, // 使用 SSL
    auth: {
        user: process.env.EMAIL_USER, // 你的 QQ 邮箱地址
        pass: process.env.EMAIL_PASS  // 16位 QQ 邮箱授权码
    }
});

/**
 * 发送情报邮件通知
 */
async function sendAlert(subject, text) {
    const mailOptions = {
        from: `"高维监控中心" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_USER,
        subject: subject,
        text: text
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`[邮件推送成功] 目标: ${process.env.EMAIL_USER}`);
    } catch (error) {
        console.error(`[邮件推送失败] 异常信息: ${error.message}`);
    }
}

if (fs.existsSync(LOCK_FILE)) {
    process.exit(0);
}
fs.writeFileSync(LOCK_FILE, process.pid.toString());
process.on('exit', () => { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); });

function fetchWithRetry(url, fileName, retries = 3) {
    const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
    for (let i = 0; i < retries; i++) {
        try {
            execSync(`curl -sL --connect-timeout 15 -A "${ua}" "${url}" > ${fileName}`);
            return true;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`[网络重试] 正在尝试恢复连接... (${i + 1}/3)`);
            execSync('sleep 5');
        }
    }
}

async function checkUpdate() {
    console.log(`--- [${new Date().toLocaleTimeString()}] 开启新一轮情报轮询 ---`);
    try {
        const indexUrl = "https://public-deploy6.test-eu.tankionline.com/browser-public/index.html";
        fetchWithRetry(indexUrl, 'index.html');
        
        const indexContent = fs.readFileSync('index.html', 'utf8');
        const match = indexContent.match(/main\.(.*)\.js/);
        
        if (match) {
            const latestJs = match[0];
            const lastVersion = fs.existsSync(LAST_VERSION_FILE) ? fs.readFileSync(LAST_VERSION_FILE, 'utf8') : '';

            if (latestJs !== lastVersion) {
                console.log(`【发现代码更新！】版本号: ${latestJs}`);
                fetchWithRetry(`https://public-deploy6.test-eu.tankionline.com/browser-public/static/js/${latestJs}`, 'new_main.js');
                
                const content = fs.readFileSync('new_main.js', 'utf8');
                let alertMsg = `检测到 main.js 版本变动: ${latestJs}\n抓取地址: https://public-deploy6.test-eu.tankionline.com/browser-public/static/js/${latestJs}`;
                
                // 海啸炮塔指纹监控
                if (/Tsunami|tsunami|spectator_limit/i.test(content)) {
                    alertMsg += `\n\n!!! 核心预警：在代码段中捕捉到 Tsunami (海啸) 相关指纹，建议立即登入测试服进行物理压制 !!!`;
                }

                await sendAlert(`【降维打击】测试服版本更新: ${latestJs}`, alertMsg);
                fs.writeFileSync(LAST_VERSION_FILE, latestJs);
            } else {
                console.log(`状态：${latestJs} 内容一致，暂无变动。`);
            }
        }
    } catch (err) {
        console.error(`[系统异常] 轮询终止: ${err.message}`);
    }
}

// 维持 120 秒/次的“上帝视角”轮询
setInterval(checkUpdate, 120000);
checkUpdate();
