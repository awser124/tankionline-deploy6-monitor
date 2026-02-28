const { execSync } = require('child_process');
const fs = require('fs');

const LOCK_FILE = 'monitor.lock';
const LAST_VERSION_FILE = 'last_version.txt';
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
];

/**
 * 检查是否已有实例在运行，防止 GitHub Actions 重叠执行
 */
if (fs.existsSync(LOCK_FILE)) {
    const pid = fs.readFileSync(LOCK_FILE, 'utf8');
    console.log(`[警告] 检测到旧实例 (PID: ${pid}) 仍在运行，自动退出当前进程以防冲突。`);
    process.exit(0);
}

// 写入当前进程 ID 作为锁
fs.writeFileSync(LOCK_FILE, process.pid.toString());

// 进程退出时自动清理锁文件
process.on('exit', () => {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
});

function fetchWithRetry(url, fileName, retries = 3) {
    const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
    for (let i = 0; i < retries; i++) {
        try {
            execSync(`curl -sL --connect-timeout 15 -A "${ua}" "${url}" > ${fileName}`);
            return true;
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`[重试] 网络抖动，5秒后进行第 ${i + 1} 次重试...`);
            execSync('sleep 5');
        }
    }
}

function checkUpdate() {
    console.log(`--- [${new Date().toLocaleTimeString()}] 开启新一轮情报轮询 ---`);
    try {
        const indexUrl = "https://public-deploy6.test-eu.tankionline.com/browser-public/index.html";
        fetchWithRetry(indexUrl, 'index.html');
        
        const indexContent = fs.readFileSync('index.html', 'utf8');
        const match = indexContent.match(/main\.(.*)\.js/);
        
        if (match) {
            const latestJs = match[0];
            const jsUrl = `https://public-deploy6.test-eu.tankionline.com/browser-public/static/js/${latestJs}`;
            
            // 读取上次记录的版本
            const lastVersion = fs.existsSync(LAST_VERSION_FILE) ? fs.readFileSync(LAST_VERSION_FILE, 'utf8') : '';

            if (latestJs !== lastVersion) {
                console.log(`【发现代码更新！】新版本号: ${latestJs}`);
                fetchWithRetry(jsUrl, 'new_main.js');
                
                const content = fs.readFileSync('new_main.js', 'utf8');
                // 重点监控 Tsunami 和 旁观者限制逻辑
                if (/Tsunami|tsunami|spectator_limit/i.test(content)) {
                    console.log("!!! 警报：在代码混淆段中提取到关键指纹，疑似海啸预置或权限变动 !!!");
                }

                fs.writeFileSync(LAST_VERSION_FILE, latestJs);
                console.log("情报已同步，版本库更新完成。");
            } else {
                console.log(`状态：${latestJs} 依然是最新，无需同步。`);
            }
        }
    } catch (err) {
        console.error(`[致命错误] 执行检查失败: ${err.message}`);
    }
}

// 保持 120 秒一轮的高频压制
setInterval(checkUpdate, 120000);
checkUpdate();
