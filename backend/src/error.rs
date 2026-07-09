use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug)]
pub enum AppError {
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    Conflict(String),
    BadRequest(String),
    RateLimited,
    Internal(anyhow::Error),
}

impl AppError {
    pub fn status(&self) -> StatusCode {
        match self {
            AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            AppError::Forbidden(_) => StatusCode::FORBIDDEN,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    pub fn detail(&self) -> String {
        match self {
            AppError::Unauthorized(m)
            | AppError::Forbidden(m)
            | AppError::NotFound(m)
            | AppError::Conflict(m)
            | AppError::BadRequest(m) => m.clone(),
            AppError::RateLimited => "too many requests".into(),
            AppError::Internal(e) => {
                tracing::error!(error = %e, "internal error");
                "internal server error".into()
            }
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = self.status();
        let body = Json(json!({ "detail": self.detail() }));
        (status, body).into_response()
    }
}

impl From<anyhow::Error> for AppError {
    fn from(e: anyhow::Error) -> Self {
        AppError::Internal(e)
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match &e {
            sqlx::Error::RowNotFound => AppError::NotFound("not found".into()),
            sqlx::Error::Database(db) if db.constraint().is_some() => {
                AppError::Conflict(db.message().to_string())
            }
            _ => AppError::Internal(e.into()),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.detail())
    }
}

impl std::error::Error for AppError {}
