import React from 'react'

import {
  Alert,
  Grid,
  Paper,
  Typography,
} from '@mui/material'

import PropTypes from 'prop-types'

import odgLogo from './resources/odg-logo.svg'

const NotFoundPage = ({ reason }) => {
  const digitStyle = {
    fontSize: '9rem',
    fontWeight: 800,
    fontFamily: 'system-ui, sans-serif',
    lineHeight: 1,
    color: '#1348FF',
    letterSpacing: '-0.04em',
    userSelect: 'none',
  }
  return (
    <Grid container>
      <Grid size={12}>
        <div
          style={{
            height: '65vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Paper
            elevation={4}
            style={{
              borderRadius: '20px',
              padding: '3rem 4rem',
              transform: 'rotate(-2deg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span style={digitStyle}>4</span>
              <img src={odgLogo} alt='ODG' width='90' />
              <span style={digitStyle}>4</span>
            </div>
            <Typography
              variant='h6'
              style={{ letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.85rem', color: '#6b8cff' }}
            >
              Page not found
            </Typography>
          </Paper>
        </div>
      </Grid>
      {
        reason && <Grid size={12}>
          <div
            style={{
              display: 'flex',
              paddingTop: '2em',
              justifyContent: 'center',
            }}
          >
            <Alert severity='info'>{reason}</Alert>
          </div>
        </Grid>
      }
    </Grid>
  )
}

NotFoundPage.propTypes = {
  reason: PropTypes.string,
}

export default NotFoundPage
