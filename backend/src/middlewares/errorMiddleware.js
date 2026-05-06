export function notFoundMiddleware(req, res) {
  res.status(404).json({
    error: 'Rota não encontrada.',
    path: req.originalUrl
  });
}

export function errorMiddleware(error, req, res, next) {
  const status = Number(error.status || error.statusCode || 500);
  if (status >= 500) {
    console.error('[api:error]', {
      method: req.method,
      path: req.originalUrl,
      message: error.message,
      stack: error.stack
    });
  }
  res.status(status).json({
    error: status >= 500 ? 'Erro interno do servidor.' : error.message
  });
}
