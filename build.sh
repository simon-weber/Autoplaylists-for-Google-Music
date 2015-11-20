for f in js/*.js; do
    browserify "$f" -d -o "js-built/$(basename $f)"
    printf '.'
done

echo 'done'
