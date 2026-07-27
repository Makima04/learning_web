//! 邮件发送：优先 Resend HTTP API；开发模式只打日志。

use reqwest::Client;
use serde_json::json;

use crate::config::Config;
use crate::error::{AppError, AppResult};

pub async fn send_verification_code(
    http: &Client,
    config: &Config,
    to_email: &str,
    code: &str,
    purpose: &str,
) -> AppResult<()> {
    let purpose_cn = match purpose {
        "register" => "注册",
        "login" => "登录",
        _ => "验证",
    };
    let subject = format!("【红宝书】{purpose_cn}验证码");
    let text = format!(
        "你的{purpose_cn}验证码是：{code}\n\n10 分钟内有效，请勿泄露。\n若非本人操作请忽略。"
    );

    if config.mail_dev {
        tracing::info!(
            event = "mail.dev_code",
            email = %to_email,
            purpose = %purpose,
            code = %code,
            "dev mail: verification code (not sent)"
        );
        return Ok(());
    }

    if config.resend_api_key.is_empty() {
        return Err(AppError::BadRequest(
            "邮件未配置：请设置 EW_RESEND_API_KEY 或 EW_MAIL_DEV=1".into(),
        ));
    }

    let resp = http
        .post("https://api.resend.com/emails")
        .bearer_auth(&config.resend_api_key)
        .json(&json!({
            "from": config.mail_from,
            "to": [to_email],
            "subject": subject,
            "text": text,
        }))
        .send()
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        tracing::error!(%status, body = %body, "resend send failed");
        return Err(AppError::Internal(anyhow::anyhow!(
            "email send failed: {status}"
        )));
    }
    Ok(())
}
