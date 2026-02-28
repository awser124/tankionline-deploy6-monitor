const fs = require('fs');
const { execSync } = require('child_process');
const nodemailer = require('nodemailer');

// 配置
const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2分钟
const TOTAL_RUN_TIME_MS = 5.6 * 60 * 60 * 1000; // 5.6小时运行上限
const BASE_URL = "https://public-deploy6.test-eu.tankionline.com"; // 去掉结尾斜杠以适配绝对路径
const RECIPIENTS = "findor2026@hotmail.com, 1146608717@qq.com";

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
    console.log(`[${new Date().toLocaleTimeString()}] 正在拉取 JS 数据...`);
    try {
        // 1. 抓取首页并匹配带前缀斜杠的路径
        const html = execSync(`curl -s ${BASE_URL}/browser-public/`).toString();
        // 修正正则以匹配 /browser-public/static/js/main.xxxx.js
        const jsMatch = html.match(/\/browser-public\/static\/js\/main\.[a-z0-9]+\.js/);
        
        if (!jsMatch) {
            console.log("未能从首页探测到 JS 路径，请检查 HTML 结构。");
            return;
        }

        // 2. 拼接完整 URL (BASE_URL + /browser-public/...)
        const targetUrl = BASE_URL + jsMatch[0];
        console.log(`探测到当前 JS 路径: ${targetUrl}`);

        // 下载文件
        execSync(`curl -s ${targetUrl} > new_main.js`);

        if (fs.existsSync('current_main.js')) {
            // 提取文本常量进行对比
            execSync(`strings current_main.js > old_strings.txt`);
            execSync(`strings new_main.js > new_strings.txt`);
            
            try {
                // diff -u 如果发现不同会抛出错误状态码
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
        
        // 更新本地备份
        fs.renameSync('new_main.js', 'current_main.js');
        console.log("数据一致，未发现变动。");
    } catch (err) {
        console.error("执行检查时发生异常:", err.message);
    }
}

async function main() {
    console.log("3D坦克测试服高频监控启动...");
    // 首次运行初始化
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
