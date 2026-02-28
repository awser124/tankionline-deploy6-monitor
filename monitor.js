const fs = require('fs');
const { execSync } = require('child_process');
const nodemailer = require('nodemailer');

// 配置
const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2分钟
const TOTAL_RUN_TIME_MS = 5.6 * 60 * 60 * 1000; // 5.6小时运行上限
const BASE_URL = "https://public-deploy6.test-eu.tankionline.com/browser-public"; 
const RECIPIENTS = "findor2026@hotmail.com, 1146608717@qq.com, 3117422562@qq.com";

const startTime = Date.now();

async function sendEmail(diffContent) {
    let transporter = nodemailer.createTransport({
        service: 'qq',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    try {
        await transporter.sendMail({
            from: `"3D坦克监控" <${process.env.EMAIL_USER}>`,
            to: RECIPIENTS,
            subject: "【警告】3D坦克测试服JS逻辑变动",
            text: "检测到测试服 main.js 字符串差异：\n\n" + diffContent
        });
        console.log("邮件通知已发出");
    } catch (e) { console.error("邮件发送失败:", e); }
}

function commitToGit() {
    try {
        execSync('git config --local user.email "actions@github.com"');
        execSync('git config --local user.name "Monitor Bot"');
        execSync('git add current_main.js');
        execSync(`git commit -m "Update JS Data: ${new Date().toLocaleString()}"`);
        execSync('git push');
    } catch (e) { console.log("Git 提交无变动"); }
}

async function check() {
    console.log(`[${new Date().toLocaleTimeString()}] 正在检查 index.html 获取最新 JS...`);
    try {
        // 1. 访问指定的 index.html 页面
        const html = execSync(`curl -sL -A "Mozilla/5.0" ${BASE_URL}/index.html`).toString();
        
        // 2. 精准匹配文件名。测试服通常格式为 main.xxxxxxxx.js
        const jsFileNameMatch = html.match(/main\.[a-z0-9]+\.js/);
        
        if (!jsFileNameMatch) {
            console.log("未能从 index.html 中探测到 main.js 路径。");
            return;
        }

        const jsName = jsFileNameMatch[0];
        // 3. 构造完整下载地址。基于 index.html 的相对位置，JS 位于 static/js/ 下
        const targetUrl = `${BASE_URL}/static/js/${jsName}`;
        
        console.log(`探测到最新文件: ${jsName}`);
        console.log(`完整抓取地址: ${targetUrl}`);

        // 下载文件
        execSync(`curl -sL -A "Mozilla/5.0" ${targetUrl} > new_main.js`);

        if (fs.existsSync('current_main.js')) {
            // 使用 strings 提取所有文本常量，这是监控“海啸”炮塔最有效的办法
            execSync(`strings current_main.js > old_strings.txt`);
            execSync(`strings new_main.js > new_strings.txt`);
            
            try {
                // 执行 diff
                execSync(`diff -u old_strings.txt new_strings.txt > diff.txt`);
            } catch (diffError) {
                const diffContent = fs.readFileSync('diff.txt', 'utf-8');
                if (diffContent.trim()) {
                    console.log("！！！检测到代码差异！！！");
                    await sendEmail(diffContent);
                    fs.renameSync('new_main.js', 'current_main.js');
                    commitToGit();
                    return;
                }
            }
        }
        
        // 更新备份
        fs.renameSync('new_main.js', 'current_main.js');
        console.log("状态：内容一致。");
    } catch (err) {
        console.error("执行检查时发生异常:", err.message);
    }
}

async function main() {
    console.log("3D坦克测试服高频监控启动...");
    // 首次运行如果不存在备份则初始化
    if (!fs.existsSync('current_main.js')) {
        await check();
    }
    
    while (Date.now() - startTime < TOTAL_RUN_TIME_MS) {
        await check();
        await new Promise(r => setTimeout(r, CHECK_INTERVAL_MS));
    }
    console.log("本次监控周期结束。");
}

main();
