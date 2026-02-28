const fs = require('fs');
const { execSync } = require('child_process');
const nodemailer = require('nodemailer');

// 配置信息
const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2分钟检查一次
const TOTAL_RUN_TIME_MS = 5.6 * 60 * 60 * 1000; // 持续运行5.6小时
const BASE_URL = "https://public-deploy6.test-eu.tankionline.com/browser-public/";
const RECIPIENTS = "findor2026@hotmail.com, 1146608717@qq.com";

const startTime = Date.now();

async function sendEmail(diffContent) {
    let transporter = nodemailer.createTransport({
        service: 'qq',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
        from: `"3D坦克监控站" <${process.env.EMAIL_USER}>`,
        to: RECIPIENTS,
        subject: "【紧急更新】3D坦克测试服JS内容变动",
        text: "检测到海啸炮塔相关或底层逻辑更新：\n\n" + diffContent
    });
}

function commitToGit() {
    try {
        execSync('git config --local user.email "actions@github.com"');
        execSync('git config --local user.name "Monitor Bot"');
        execSync('git add current_main.js');
        execSync('git commit -m "自动更新: 检测到测试服变更 ' + new Date().toLocaleString() + '"');
        execSync('git push');
        console.log("Git 提交成功");
    } catch (e) {
        console.log("Git 提交跳过（可能无实际文件变动）");
    }
}

async function check() {
    console.log(`[${new Date().toLocaleTimeString()}] 正在检查更新...`);
    try {
        // 1. 获取最新 JS 路径
        const html = execSync(`curl -s ${BASE_URL}`).toString();
        const jsMatch = html.match(/static\/js\/main\.[a-z0-9]+\.js/);
        if (!jsMatch) return;

        const fullUrl = BASE_URL + jsMatch[0];
        execSync(`curl -s ${fullUrl} > new_main.js`);

        if (fs.existsSync('current_main.js')) {
            // 2. 提取字符串对比
            execSync(`strings current_main.js > old_strings.txt`);
            execSync(`strings new_main.js > new_strings.txt`);
            
            try {
                // 使用 diff -u，如果不同会抛出异常（退出码不为0）
                execSync(`diff -u old_strings.txt new_strings.txt > diff.txt`);
            } catch (diffError) {
                const diffContent = fs.readFileSync('diff.txt', 'utf-8');
                if (diffContent.trim()) {
                    console.log("检测到差异！正在发送邮件...");
                    await sendEmail(diffContent);
                    fs.renameSync('new_main.js', 'current_main.js');
                    commitToGit();
                    return;
                }
            }
        }
        
        // 如果没有差异，也更新一下文件（同步最新的哈希文件名）
        fs.renameSync('new_main.js', 'current_main.js');
    } catch (error) {
        console.error("检查过程出错:", error.message);
    }
}

async function main() {
    while (Date.now() - startTime < TOTAL_RUN_TIME_MS) {
        await check();
        await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
    }
    console.log("达到本次运行时间上限，脚本退出。");
}

main();
