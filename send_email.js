const nodemailer = require('nodemailer');
const fs = require('fs');

async function main() {
    // 检查是否有差异文件
    if (!fs.existsSync('diff.txt')) {
        console.log('无差异内容，跳过邮件发送。');
        return;
    }

    const diffContent = fs.readFileSync('diff.txt', 'utf-8');
    if (!diffContent.trim()) return;

    // 配置邮件运输（建议使用 QQ 邮箱或 Gmail 的 SMTP）
    // 注意：这里的 user 和 pass 需要在 GitHub Secrets 中配置
    let transporter = nodemailer.createTransport({
        service: 'qq', // 或者使用 host: "smtp.qq.com"
        auth: {
            user: process.env.EMAIL_USER, 
            pass: process.env.EMAIL_PASS  // 邮箱授权码，非登录密码
        }
    });

    let mailOptions = {
        from: `"3D坦克监控站" <${process.env.EMAIL_USER}>`,
        to: "findor2026@hotmail.com, 1146608717@qq.com",
        subject: "【自动提醒】3D坦克测试服JS文件更新记录",
        text: "检测到测试服 main.js 发生变化，差异如下：\n\n" + diffContent
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('邮件发送成功');
    } catch (error) {
        console.error('邮件发送失败:', error);
        process.exit(1);
    }
}

main();
