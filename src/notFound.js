import React from 'react'

import { Alert, Grid } from '@mui/material'

import PropTypes from 'prop-types'

import octo from './resources/notFoundOcto.png'
import robo from './resources/notFoundRobo.png'
import box from './resources/notFoundBox.png'

const NotFoundPage = ({ reason }) => {
  const images = [
    {
      style: { height: '100%' },
      src: octo,
      alt: 'sad octo',
    },
    {
      style: { height: '100%' },
      src: robo,
      alt: 'sad robo',
    },
    {
      style: { height: '95%' },
      src: box,
      alt: 'sad box',
    },
  ]

  const image = images[Math.floor(Math.random() * images.length)]

  return (
    <Grid container>
      <Grid size={12}>
        <div
          style={{
            height: '65vh',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <img style={image.style} src={image.src} alt={image.alt} />
        </div>
      </Grid>
      {
        reason && <Grid size={12}>
          <div
            style={{
              display: 'flex',
              paddingTop: '4em',
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
