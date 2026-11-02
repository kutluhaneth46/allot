import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Shell } from '@/components/Layout'
import { NetworkProvider } from '@/components/NetworkProvider'
import Funder from '@/pages/Funder'
import Landing from '@/pages/Landing'
import Merchant from '@/pages/Merchant'
import Pay from '@/pages/Pay'
import ReceiptPage from '@/pages/ReceiptPage'
import Recipient from '@/pages/Recipient'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <NetworkProvider>
      <ScrollToTop />
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Landing />} />
          <Route path="funder" element={<Funder />} />
          <Route path="recipient" element={<Recipient />} />
          <Route path="merchant" element={<Merchant />} />
          <Route path="pay" element={<Pay />} />
          <Route path="receipt/:txHash" element={<ReceiptPage />} />
          <Route path="*" element={<Landing />} />
        </Route>
      </Routes>
    </NetworkProvider>
  )
}
