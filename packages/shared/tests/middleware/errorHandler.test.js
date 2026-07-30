const { createErrorHandler, notFoundHandler } = require('../../src/middleware/errorHandler');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function silentLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('notFoundHandler', () => {
  test('responds with 404', () => {
    const res = mockRes();
    notFoundHandler({}, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('createErrorHandler', () => {
  test('maps a Mongo duplicate key error (11000) to 409', () => {
    const logger = silentLogger();
    const errorHandler = createErrorHandler(logger);
    const res = mockRes();

    errorHandler({ code: 11000 }, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test('maps a Mongoose ValidationError to 400', () => {
    const errorHandler = createErrorHandler(silentLogger());
    const res = mockRes();

    errorHandler({ name: 'ValidationError', message: 'title is required' }, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'title is required' });
  });

  test('maps a Mongoose CastError (bad ObjectId) to 404', () => {
    const errorHandler = createErrorHandler(silentLogger());
    const res = mockRes();

    errorHandler({ name: 'CastError' }, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('maps a MulterError (e.g. file too large) to 400', () => {
    const errorHandler = createErrorHandler(silentLogger());
    const res = mockRes();

    errorHandler({ name: 'MulterError', message: 'File too large' }, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'File too large' });
  });

  test('honors an explicit err.status for application errors under 500', () => {
    const errorHandler = createErrorHandler(silentLogger());
    const res = mockRes();

    errorHandler({ status: 400, message: 'Project not found' }, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Project not found' });
  });

  test('logs and hides details for unexpected 500 errors', () => {
    const logger = silentLogger();
    const errorHandler = createErrorHandler(logger);
    const res = mockRes();

    errorHandler(new Error('boom'), {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal server error' });
    expect(logger.error).toHaveBeenCalled();
  });
});
