// ErrorBoundary — กัน component crash แล้วจอขาวทั้งหน้า
import { Component } from 'react';

function log(level, fn, msg, ctx) {
  console.log(`[${new Date().toISOString()}] [${level}] [ErrorBoundary/${fn}] ${msg}` + (ctx ? ' | ' + JSON.stringify(ctx) : ''));
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    log('ERROR', 'componentDidCatch', error.message, { stack: error.stack, componentStack: info?.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 bg-slate-50">
          <div className="bg-white rounded-2xl shadow p-6 max-w-md text-center">
            <svg className="w-12 h-12 mx-auto mb-3 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            <div className="font-bold text-lg mb-2">หน้านี้มีปัญหาชั่วคราว</div>
            <div className="text-sm text-slate-500 mb-4 break-all">{String(this.state.error.message || this.state.error)}</div>
            <button
              onClick={() => location.reload()}
              className="px-5 py-2.5 rounded-xl bg-sunrise-500 text-white font-semibold hover:opacity-90"
              style={{ background: '#FF6B35' }}>
              โหลดใหม่
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
