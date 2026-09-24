export function errorMiddleware(error, request, response, _next) {
  console.error(`[${request.method} ${request.originalUrl}]`, error);
  const status = error.type === 'entity.too.large' ? 413 : 500;
  const message = error.type === 'entity.too.large'
    ? 'Dữ liệu gửi lên quá lớn. Vui lòng giảm kích thước file và thử lại.'
    : 'Internal server error';
  response.status(status).json({
    success: false,
    message,
    errorCode: error.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR',
  });
}
