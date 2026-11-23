import React from 'react'

import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom'
import RefreshIcon from '@mui/icons-material/Refresh'
import { alpha } from '@mui/material/styles'

import PropTypes from 'prop-types'
import { useSnackbar } from 'notistack'

import {
  useFetchAuthUser,
  useFetchBacklogItems,
  useFetchContainerStatuses,
} from '../fetch'
import CopyOnClickChip from '../util/copyOnClickChip'
import { PersistentDrawerLeft } from '../layout'
import {
  backlogItemPhases,
  COMPLIANCE_TOOLS,
  errorSnackbarProps,
  PRIORITIES,
} from '../consts'
import {
  camelCaseToDisplayText,
  getAggregatedContainerStatus,
  pluralise,
  trimLongString,
  useInterval,
  hasUserAccess,
} from '../util'
import { routes, serviceExtensions } from '../api'
import { ServiceStatus } from './service'
import { ConfigContext, SearchParamContext } from '../App'
import ExtraWideTooltip from '../util/extraWideTooltip'
import MissingPermissionsButton from '../util/missingPermissionsButton'


export const MonitoringPage = () => {
  const theme = useTheme()
  const searchParamContext = React.useContext(SearchParamContext)
  const service = searchParamContext.get('service')

  // use cache during initial load
  const skipCache = React.useRef(false)

  const [statuses, statusesState, refreshContainerStatus] = useFetchContainerStatuses({
    service: service,
    skipCache: skipCache.current,
  })
  const aggregatedContainerStatus = getAggregatedContainerStatus({statuses, statusesAreLoading: statusesState.isLoading})

  const [priority, setPriority] = React.useState(PRIORITIES.NONE)

  // refreshing should bypass cache
  const refreshWithoutCache = React.useCallback((callable) => {
    skipCache.current = true
    callable()
  }, [])

  const refresh = {
    statuses: () => refreshWithoutCache(refreshContainerStatus),
  }

  return <PersistentDrawerLeft open>
    <Stack spacing={1}>
      <Typography variant='h4' style={{marginBottom: '2rem'}}>
        {`Monitoring - ${camelCaseToDisplayText(service)}`}
      </Typography>
      {
        Object.values(COMPLIANCE_TOOLS).includes(service) ? <BacklogTab
          service={service}
          aggregatedContainerStatus={aggregatedContainerStatus}
          priorityState={{priority, setPriority}}
          refresh={refresh}
        /> : <Stack direction='row' spacing={3} sx={{display: 'flex', alignItems: 'center'}}>
          <IconButton
            title='Refresh'
            sx={{
              backgroundColor: theme.palette.grey,
              border: `1px solid ${theme.palette.text.primary}`,
              color: theme.palette.text.primary,
            }}
            onClick={refresh.statuses}
            disabled={statusesState.isLoading}
          >
            <RefreshIcon/>
          </IconButton>
          <ServiceStatus serviceStatus={aggregatedContainerStatus}/>
        </Stack>
      }
    </Stack>
  </PersistentDrawerLeft>
}
MonitoringPage.displayName = 'MonitoringPage'
MonitoringPage.propTypes = {}


const BacklogTab = ({
  service,
  aggregatedContainerStatus,
  priorityState,
  refresh,
}) => {
  const {priority} = priorityState

  // use cache during initial load
  const skipCache = React.useRef(false)

  const [backlogItems, backlogItemsState, refreshBacklogItems] = useFetchBacklogItems({
    service: service,
    skipCache: skipCache.current,
  })
  const backlogItemsFetchDetails = {
    backlogItems: backlogItems,
    isLoading: backlogItemsState.isLoading,
    isError: backlogItemsState.error,
  }
  const [selectedBacklogItems, setSelectedBacklogItems] = React.useState([])

  const filteredBacklogItems = React.useCallback(() => {
    if (backlogItems === undefined) return []
    return backlogItems.sort((a, b) => {
      // claimed items first
      if (Boolean(backlogItemClaimedAt(a)) && !backlogItemClaimedAt(b)) return -1
      if (Boolean(backlogItemClaimedAt(b)) && !backlogItemClaimedAt(a)) return 1

      // highest priority first
      if (a.spec.priority > b.spec.priority) return -1
      if (b.spec.priority > a.spec.priority) return 1

      // oldest creation date first
      return a.spec.timestamp.localeCompare(b.spec.timestamp)
    }).map((backlogItem, idx) => {
      // indicating backlog position even if some backlog items are filtered out
      return {
        ...backlogItem,
        position: idx + 1,
        claimed: Boolean(backlogItemClaimedAt(backlogItem)),
        claimedAt: backlogItemClaimedAt(backlogItem),
        phase: backlogItem.status?.phase,
        error: backlogItem.status?.error,
      }
    }).filter((backlogItem) => {
      return backlogItem.spec.priority >= priority.value
    })
  }, [priority, backlogItems, backlogItemsState.isLoading, backlogItemsState.error])

  const backlogItemClaimedAt = React.useCallback((backlogItem) => {
    return backlogItem.status?.phase === backlogItemPhases.PROCESSING ? backlogItem.status.claimed_at : null
  }, [])

  React.useEffect(() => {
    // remove selection of backlog items which were processed in the meantime

    setSelectedBacklogItems((prev) => prev.filter((backlogItem) => {
      return backlogItems.map((bli) => bli.metadata.uid).includes(backlogItem.metadata.uid)
    }))
  }, [backlogItems])

  // periodically update backlog items
  useInterval(() => {
    refresh.statuses()
    skipCache.current = true
    refreshBacklogItems()
  }, !(backlogItemsState.isLoading || backlogItemsState.error) ? 5000 : null)

  return <>
    <BacklogHeader
      aggregatedContainerStatus={aggregatedContainerStatus}
      priorityState={priorityState}
      backlogItemsFetchDetails={backlogItemsFetchDetails}
      selectedBacklogItems={selectedBacklogItems}
      setSelectedBacklogItems={setSelectedBacklogItems}
      refreshBacklogItems={refreshBacklogItems}
      refresh={refresh}
    />
    <div style={{height: '2rem'}}/>
    <BacklogItems
      filteredBacklogItems={filteredBacklogItems()}
      error={backlogItemsState.error}
      selectedBacklogItems={selectedBacklogItems}
      setSelectedBacklogItems={setSelectedBacklogItems}
      refreshBacklogItems={refreshBacklogItems}
      showLoadingAnimation={backlogItems === undefined && backlogItemsState.isLoading} // skip animation on re-fetch
    />
  </>
}
BacklogTab.displayName = 'BacklogTab'
BacklogTab.propTypes = {
  service: PropTypes.string.isRequired,
  aggregatedContainerStatus: PropTypes.object.isRequired,
  priorityState: PropTypes.object.isRequired,
  refresh: PropTypes.object.isRequired,
}


const BacklogHeader = ({
  aggregatedContainerStatus,
  priorityState,
  backlogItemsFetchDetails,
  selectedBacklogItems,
  setSelectedBacklogItems,
  refreshBacklogItems,
  refresh,
}) => {
  const theme = useTheme()
  const { enqueueSnackbar } = useSnackbar()

  const [deletionIsLoading, setDeletionIsLoading] = React.useState(false)

  const [user] = useFetchAuthUser()
  const route = new URL(routes.serviceExtensions.backlogItems()).pathname
  const method = 'DELETE'
  const isAuthorised = hasUserAccess({
    permissions: user?.permissions,
    route: route,
    method: method,
  })

  const {priority, setPriority} = priorityState

  const fetchDeleteBacklogItem = async () => {
    setDeletionIsLoading(true)

    try {
      await serviceExtensions.backlogItems.delete({
        names: selectedBacklogItems.map((backlogItem) => backlogItem.metadata.name)
      })
    } catch(error) {
      enqueueSnackbar(
        `Could not delete ${selectedBacklogItems.length} backlog ${pluralise('item', selectedBacklogItems.length)}`,
        {
          ...errorSnackbarProps,
          details: error.toString(),
          onRetry: () => fetchDeleteBacklogItem(),
        },
      )
      setDeletionIsLoading(false)
      return
    }

    enqueueSnackbar(
      `Successfully deleted ${selectedBacklogItems.length} backlog ${pluralise('item', selectedBacklogItems.length)}`,
      {
        variant: 'success',
        anchorOrigin: {
          vertical: 'bottom',
          horizontal: 'right',
        },
        autoHideDuration: 6000,
      },
    )
    setSelectedBacklogItems([])
    setDeletionIsLoading(false)
    refreshBacklogItems()
  }

  return (
    <Stack
      direction='row'
      spacing={3}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
      <Stack
        direction='row'
        spacing={3}
        sx={{
          display: 'flex',
          alignItems: 'center'
        }}>
        <PriorityFilter
          priority={priority}
          setPriority={setPriority}
        />
        <IconButton
          title='Refresh'
          sx={{
            backgroundColor: theme.palette.grey,
            border: `1px solid ${theme.palette.text.primary}`,
            color: theme.palette.text.primary,
          }}
          onClick={() => {
            refresh.statuses()
            refreshBacklogItems()
          }}
          disabled={backlogItemsFetchDetails.isLoading}
        >
          <RefreshIcon/>
        </IconButton>
        <ServiceStatus serviceStatus={aggregatedContainerStatus}/>
      </Stack>
      <span>
        {
          isAuthorised ? <Button
            color='secondary'
            endIcon={<DeleteIcon/>}
            onClick={fetchDeleteBacklogItem}
            startIcon={deletionIsLoading && <CircularProgress size='1em'/>}
            disabled={deletionIsLoading || backlogItemsFetchDetails.isLoading || selectedBacklogItems.length === 0}
            fullWidth
          >
            {`Delete Selected Backlog Items (${selectedBacklogItems.length})`}
          </Button> : <MissingPermissionsButton
            route={route}
            method={method}
            buttonText={`Delete Selected Backlog Items (${selectedBacklogItems.length})`}
          />
        }
      </span>
    </Stack>
  )
}
BacklogHeader.displayName = 'BacklogHeader'
BacklogHeader.propTypes = {
  aggregatedContainerStatus: PropTypes.object.isRequired,
  priorityState: PropTypes.object.isRequired,
  backlogItemsFetchDetails: PropTypes.object.isRequired,
  selectedBacklogItems: PropTypes.arrayOf(PropTypes.object).isRequired,
  setSelectedBacklogItems: PropTypes.func.isRequired,
  refreshBacklogItems: PropTypes.func.isRequired,
  refresh: PropTypes.object.isRequired,
}


const BacklogItems = ({
  filteredBacklogItems,
  selectedBacklogItems,
  setSelectedBacklogItems,
  refreshBacklogItems,
  showLoadingAnimation,
  error,
}) => {
  const context = React.useContext(ConfigContext)

  const [page, setPage] = React.useState(0)
  const [rowsPerPage, setRowsPerPage] = React.useState(25)

  const orderDirections = {
    ASCENDING: 'asc',
    DESCENDING: 'desc',
  }
  const orderAttributes = {
    POSITION: 'position',
    COMPONENT: 'component',
    ARTEFACT: 'artefact',
    PRIORITY: 'priority',
    CLAIMED: 'claimed',
  }

  const [order, setOrder] = React.useState(orderDirections.ASCENDING)
  const [orderBy, setOrderBy] = React.useState(orderAttributes.POSITION)

  React.useEffect(() => {
    const calculateMaxPage = () => {
      if (!filteredBacklogItems) return 0
      return parseInt((filteredBacklogItems.length - 1) / rowsPerPage)
    }
    if (page > calculateMaxPage()) setPage(calculateMaxPage())
  }, [filteredBacklogItems, page, rowsPerPage])

  if (error) return <Alert severity='error' variant={context.prefersDarkMode ? 'outlined' : 'standard'}>
    Backlog items could not be fetched.
  </Alert>
  // show loading skeleton if service changes (no items available yet) or no items found and is loading again
  else if (showLoadingAnimation) return <Skeleton/>
  else if (filteredBacklogItems.length === 0) return <Alert severity='success' variant={context.prefersDarkMode ? 'outlined' : 'standard'}>
    No open backlog items {String.fromCodePoint('0x1F973')} {/* "Party-Face" symbol */}
  </Alert>

  const allSelected = () => {
    return filteredBacklogItems.every((backlogItem) => {
      return selectedBacklogItems.map((bli) => bli.metadata.uid).includes(backlogItem.metadata.uid)
    })
  }

  const handleSort = (orderBy) => {
    setOrder(order === orderDirections.ASCENDING ? orderDirections.DESCENDING : orderDirections.ASCENDING)
    setOrderBy(orderBy)
  }

  const sortData = (data, comparator) => {
    return data.sort(comparator)
  }

  const getAccessMethod = () => {
    if (orderBy === orderAttributes.POSITION)
      return (bli) => bli.position
    if (orderBy === orderAttributes.COMPONENT)
      return (bli) => bli.spec.artefact.component_name
    if (orderBy === orderAttributes.ARTEFACT)
      return (bli) => bli.spec.artefact.artefact.artefact_name
    if (orderBy === orderAttributes.PRIORITY)
      return (bli) => bli.spec.priority
    if (orderBy === orderAttributes.CLAIMED)
      return (bli) => bli.claimed
  }

  const descendingComparator = (l, r) => {
    if (r < l) return -1
    if (r > l) return 1
    return 0
  }

  const getComparator = () => {
    const accessOrderByProperty = getAccessMethod()
    return order === orderDirections.DESCENDING
      ? (l, r) => descendingComparator(accessOrderByProperty(l), accessOrderByProperty(r))
      : (l, r) => -descendingComparator(accessOrderByProperty(l), accessOrderByProperty(r))
  }

  const handleChangePage = (e, newPage) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (e) => {
    setRowsPerPage(parseInt(e.target.value, 10))
    setPage(0)
  }

  return <Paper>
    <TableContainer>
      <Table stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell
              width='70em'
              onClick={() => {
                if (allSelected()) {
                  setSelectedBacklogItems([])
                  return
                }
                setSelectedBacklogItems((prev) => [
                  ...prev,
                  ...filteredBacklogItems.filter((backlogItem) => !selectedBacklogItems.map((bli) => bli.metadata.uid).includes(backlogItem.metadata.uid))
                ])
              }}
              sx={{
                '&:hover': {
                  cursor: 'pointer',
                },
              }}
            >
              <Checkbox checked={allSelected()}/>
            </TableCell>
            <TableCell sx={{textAlign: 'center'}}>
              <TableSortLabel
                onClick={() => handleSort(orderAttributes.POSITION)}
                active={orderBy === orderAttributes.POSITION}
                direction={order}
              >
                Pos
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                onClick={() => handleSort(orderAttributes.COMPONENT)}
                active={orderBy === orderAttributes.COMPONENT}
                direction={order}
              >
                Component
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{textAlign: 'center'}}>Version</TableCell>
            <TableCell>
              <TableSortLabel
                onClick={() => handleSort(orderAttributes.ARTEFACT)}
                active={orderBy === orderAttributes.ARTEFACT}
                direction={order}
              >
                Artefact
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{textAlign: 'center'}}>Version</TableCell>
            <TableCell sx={{textAlign: 'center'}}>
              <TableSortLabel
                onClick={() => handleSort(orderAttributes.PRIORITY)}
                active={orderBy === orderAttributes.PRIORITY}
                direction={order}
              >
                Priority
              </TableSortLabel>
            </TableCell>
            <TableCell sx={{textAlign: 'center'}}>
              <TableSortLabel
                onClick={() => handleSort(orderAttributes.CLAIMED)}
                active={orderBy === orderAttributes.CLAIMED}
                direction={order}
              >
                In Process
              </TableSortLabel>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {
            sortData([...filteredBacklogItems], getComparator())
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              .map((backlogItem) => <BacklogItemRow
                key={backlogItem.metadata.uid}
                backlogItem={backlogItem}
                selectedBacklogItems={selectedBacklogItems}
                setSelectedBacklogItems={setSelectedBacklogItems}
                refreshBacklogItems={refreshBacklogItems}
              />)
          }
        </TableBody>
      </Table>
    </TableContainer>
    <TablePagination
      rowsPerPageOptions={[25, 50, 100]}
      component='div'
      count={filteredBacklogItems.length}
      rowsPerPage={rowsPerPage}
      page={page}
      onPageChange={handleChangePage}
      onRowsPerPageChange={handleChangeRowsPerPage}
    />
  </Paper>
}
BacklogItems.displayName = 'BacklogItems'
BacklogItems.propTypes = {
  filteredBacklogItems: PropTypes.arrayOf(PropTypes.object).isRequired,
  selectedBacklogItems: PropTypes.arrayOf(PropTypes.object).isRequired,
  setSelectedBacklogItems: PropTypes.func.isRequired,
  refreshBacklogItems: PropTypes.func.isRequired,
  showLoadingAnimation: PropTypes.bool.isRequired,
  error: PropTypes.any,
}


const BacklogItemRow = ({
  backlogItem,
  selectedBacklogItems,
  setSelectedBacklogItems,
  refreshBacklogItems,
}) => {
  const theme = useTheme()
  const { enqueueSnackbar } = useSnackbar()

  const [user] = useFetchAuthUser()
  const isAuthorised = hasUserAccess({
    permissions: user?.permissions,
    route: new URL(routes.serviceExtensions.backlogItems()).pathname,
    method: 'PUT',
  })

  const priority = Object.values(PRIORITIES).find((p) => backlogItem.spec.priority === p.value)

  const updateBacklogItemPriority = async (backlogItem, priority) => {
    try {
      await serviceExtensions.backlogItems.update({
        name: backlogItem.metadata.name,
        spec: {
          ...backlogItem.spec,
          priority: priority.value,
        },
      })
      refreshBacklogItems()
    } catch(error) {
      enqueueSnackbar(
        `Could not update priority of backlog item to ${priority.name}`,
        {
          ...errorSnackbarProps,
          details: error.toString(),
          onRetry: () => updateBacklogItemPriority(backlogItem, priority),
        },
      )
    }
  }

  return <TableRow
    onClick={() => {
      if (selectedBacklogItems.find((selectedBacklogItem) => selectedBacklogItem.metadata.uid === backlogItem.metadata.uid)) {
        setSelectedBacklogItems((prev) => prev.filter((selectedBacklogItem) => selectedBacklogItem.metadata.uid !== backlogItem.metadata.uid))
        return
      }
      setSelectedBacklogItems((prev) => [
        ...prev,
        backlogItem,
      ])
    }}
    sx={{
      '&:hover': {
        backgroundColor: alpha(theme.palette.common.black, 0.15),
        cursor: 'pointer',
      },
    }}
  >
    <TableCell sx={{width: '5vw'}}>
      <Checkbox checked={Boolean(selectedBacklogItems.find((selectedBacklogItem) => selectedBacklogItem.metadata.uid === backlogItem.metadata.uid))}/>
    </TableCell>
    <TableCell sx={{width: '5vw', textAlign: 'center'}}>
      <Typography variant='inherit'>{backlogItem.position}</Typography>
    </TableCell>
    <TableCell sx={{width: '20vw'}}>
      <Typography variant='inherit'>{backlogItem.spec.artefact.component_name}</Typography>
    </TableCell>
    <TableCell sx={{width: '15vw', textAlign: 'center'}}>
      {backlogItem.spec.artefact.component_version && <CopyOnClickChip
        value={backlogItem.spec.artefact.component_version}
        label={trimLongString(backlogItem.spec.artefact.component_version, 12)}
        chipProps={{
          variant: 'outlined',
          title: backlogItem.spec.artefact.component_version,
        }}
      />
      }
    </TableCell>
    <TableCell sx={{width: '20vw'}}>
      <Typography variant='inherit'>{backlogItem.spec.artefact.artefact.artefact_name}</Typography>
    </TableCell>
    <TableCell sx={{width: '15vw', textAlign: 'center'}}>
      {backlogItem.spec.artefact.artefact.artefact_version && <CopyOnClickChip
        value={backlogItem.spec.artefact.artefact.artefact_version}
        label={trimLongString(backlogItem.spec.artefact.artefact.artefact_version, 12)}
        chipProps={{
          variant: 'outlined',
          title: backlogItem.spec.artefact.artefact.artefact_version,
        }}
      />
      }
    </TableCell>
    <TableCell sx={{width: '10vw', textAlign: 'center'}}>
      {
        isAuthorised ? <FormControl variant='standard'>
          <Select
            value={Object.values(PRIORITIES).find((p) => backlogItem.spec.priority === p.value)}
            onChange={(e) => updateBacklogItemPriority(backlogItem, e.target.value)}
            onClick={(e) => e.stopPropagation()}
          >
            {
              Object.values(PRIORITIES).map((p) => <MenuItem key={p.name} value={p}>
                <Typography color={p.color} variant='body2'>
                  {p.name}
                </Typography>
              </MenuItem>)
            }
          </Select>
        </FormControl> : <Typography color={priority.color} variant='body2'>
          {
            priority.name
          }
        </Typography>
      }
    </TableCell>
    <TableCell sx={{width: '10vw', textAlign: 'center'}}>
      {
        backlogItem.phase && backlogItem.phase !== backlogItemPhases.PENDING && (() => {
          const lines = [
            `Phase: ${backlogItem.phase}`,
            backlogItem.claimedAt && `Started at: ${new Date(backlogItem.claimedAt).toLocaleString(navigator.language)}`,
          ].filter(Boolean).join('\n')

          if (!backlogItem.error) return <Tooltip title={<span style={{whiteSpace: 'pre-line'}}>{lines}</span>}>
            <HourglassBottomIcon fontSize='small'/>
          </Tooltip>

          const title = <span style={{display: 'block', maxWidth: 1000}}>
            <span style={{whiteSpace: 'pre-line', fontWeight: 'bold', fontSize: 13}}>{lines}</span>
            <pre style={{margin: '4px 0 0', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', opacity: 0.8}}>
              {[backlogItem.error.message, backlogItem.error.traceback].filter(Boolean).join('\n\n')}
            </pre>
          </span>

          return <ExtraWideTooltip title={title}>
            <HourglassBottomIcon fontSize='small' color='error'/>
          </ExtraWideTooltip>
        })()
      }
    </TableCell>
  </TableRow>
}
BacklogItemRow.displayName = 'BacklogItemRow'
BacklogItemRow.propTypes = {
  backlogItem: PropTypes.object.isRequired,
  selectedBacklogItems: PropTypes.arrayOf(PropTypes.object).isRequired,
  setSelectedBacklogItems: PropTypes.func.isRequired,
  refreshBacklogItems: PropTypes.func.isRequired,
}


const PriorityFilter = ({
  priority,
  setPriority,
}) => {
  return <FormControl variant='standard'>
    <InputLabel>Minimum Priority</InputLabel>
    <Select
      value={priority}
      onChange={(e) => setPriority(e.target.value)}
      sx={{ minWidth: '150px' }}
    >
      {
        Object.values(PRIORITIES).map((p) => <MenuItem key={p.name} value={p}>
          <Typography color={p.color} variant='body2'>
            {p.name}
          </Typography>
        </MenuItem>)
      }
    </Select>
  </FormControl>
}
PriorityFilter.displayName = 'PriorityFilter'
PriorityFilter.propTypes = {
  priority: PropTypes.object.isRequired,
  setPriority: PropTypes.func.isRequired,
}
