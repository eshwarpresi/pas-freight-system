import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import api from '../lib/api'
import { Ship, Shield, Globe, Lock } from 'lucide-react'

const GOOGLE_CLIENT_ID = '123728729376-iul6n1nls7dnu89q985u75d3hjnid2j8.apps.googleusercontent.com'

export default function LoginPage({ setUser }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/google', {
        credential: credentialResponse.credential
      })
      
      const { token, user } = res.data.data
      localStorage.setItem('pas_token', token)
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      setUser(user)
      navigate('/')
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Please try again.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-600 p-4">
        {/* Animated background pattern */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        </div>

        <div className="w-full max-w-md relative z-10">
          {/* Glass card */}
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
            {/* Logo Section */}
            <div className="text-center mb-8">
              <div className="relative inline-block">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xl shadow-indigo-500/30">
                  <Ship size={36} className="text-white" />
                </div>
                <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                  <Shield size={14} className="text-white" />
                </div>
              </div>
              
              <h1 className="text-3xl font-bold text-gray-900 mt-6 tracking-tight">
                PAS<span className="text-indigo-600">Freight</span>
              </h1>
              <p className="text-gray-500 mt-2 text-sm">
                Freight Management System
              </p>
              <div className="w-12 h-1 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full mx-auto mt-3" />
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl animate-in">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            {/* Google Login Card */}
            <div className="bg-gradient-to-br from-gray-50 to-indigo-50/50 rounded-2xl p-6 border border-gray-100">
              <p className="text-xs text-gray-500 text-center mb-4 uppercase tracking-wider font-semibold">
                Secure Sign In
              </p>
              <div className="flex justify-center">
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">Verifying your account...</p>
                  </div>
                ) : (
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={() => setError('Google login failed. Please try again.')}
                    theme="outline"
                    size="large"
                    text="signin_with"
                    shape="pill"
                    width="280"
                  />
                )}
              </div>
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="text-center">
                <Lock size={14} className="text-indigo-400 mx-auto mb-1" />
                <p className="text-[10px] text-gray-400">Encrypted</p>
              </div>
              <div className="text-center">
                <Shield size={14} className="text-indigo-400 mx-auto mb-1" />
                <p className="text-[10px] text-gray-400">Secure</p>
              </div>
              <div className="text-center">
                <Globe size={14} className="text-indigo-400 mx-auto mb-1" />
                <p className="text-[10px] text-gray-400">Google SSO</p>
              </div>
            </div>

            {/* Footer */}
            <p className="text-[10px] text-gray-400 text-center mt-6">
              Only authorized <span className="text-indigo-500 font-semibold">@pasfreight.com</span> accounts can access this system.
              <br />
              <span className="text-gray-300">© {new Date().getFullYear()} PAS Freight Services Pvt Ltd</span>
            </p>
          </div>
        </div>
      </div>
    </GoogleOAuthProvider>
  )
}