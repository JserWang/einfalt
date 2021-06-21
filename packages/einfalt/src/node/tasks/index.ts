import gulp from 'gulp'

export function execute(tasks: gulp.TaskFunction[]) {
  return new Promise((resolve) => {
    gulp.series([...tasks])(() => {
      resolve('')
    })
  })
}
