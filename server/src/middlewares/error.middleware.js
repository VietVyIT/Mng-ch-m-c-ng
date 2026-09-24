export function errorMiddleware(error, _request, response, _next) {
  console.error(error);
  const status = error.type === 'entity.too.large' ? 413 : 500;
  const message = error.type === 'entity.too.large'
    ? 'Ảnh chụp quá lớn. Vui lòng thử lại.'
    : 'Internal server error';
  response.status(status).json({
    success: false,
    message,
    errorCode: error.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR',
  });
}
